/**
 * Buoyant - Free NOAA Marine Data Client
 * 
 * Core functionality:
 * 1. Free access to NOAA marine data
 * 2. Properly parsed and normalized
 * 3. Fallbacks when sources fail
 * 4. Validation to prevent bad requests
 */

const axios = require('axios');
const NDBCClient = require('./lib/clients/ndbc');
const TideClient = require('./lib/clients/tide');
const NWSWaveClient = require('./lib/clients/nws-waves');
const WeatherClient = require('./lib/clients/weather');
const CoastalValidator = require('./lib/validators/coastal');

class Buoyant {
  constructor(options = {}) {
    this.units = options.units || 'metric'; // metric or imperial
    this.timeout = options.timeout || 10000;
    this.quiet = options.quiet || false;
    
    // Initialize clients with quiet option
    this.ndbc = new NDBCClient({ quiet: this.quiet });
    this.tides = new TideClient({ quiet: this.quiet });
    this.nws = new NWSWaveClient({ quiet: this.quiet });
    this.weather = new WeatherClient({ quiet: this.quiet });
    this.validator = new CoastalValidator({ quiet: this.quiet });
    
    this.http = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Buoyant'
      }
    });
  }
  
  /**
   * Get weather forecast and current conditions
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Object} Weather data including current conditions, forecast, and alerts
   */
  async getWeather(lat, lon) {
    return this.weather.getWeather(lat, lon);
  }
  
  /**
   * Get data from a specific NDBC buoy
   * @param {string} buoyId - NDBC buoy identifier
   * @returns {Object} Buoy observation data
   */
  async getBuoy(buoyId) {
    return this.ndbc.getBuoyData(buoyId);
  }
  
  /**
   * Get sea state data by US zip code
   * @param {string} zipCode - US zip code
   * @returns {Object} Sea state data from best available source
   */
  async getSeaStateByZip(zipCode) {
    try {
      // Use NWS zip code redirect to get coordinates
      const zipUrl = `https://forecast.weather.gov/zipcity.php?inputstring=${zipCode}`;
      
      // Follow redirects to get the final URL with coordinates
      const response = await this.http.get(zipUrl, {
        maxRedirects: 5,
        // Don't throw on redirect status codes
        validateStatus: (status) => status >= 200 && status < 500
      });
      
      // The response URL should contain lat/lon parameters
      // Format: MapClick.php?lat=21.5955&lon=-158.109
      const finalUrl = response.request?.res?.responseUrl || response.config?.url || '';
      
      // Parse coordinates from URL parameters
      const urlParams = new URL(finalUrl, 'https://forecast.weather.gov');
      const lat = urlParams.searchParams.get('lat');
      const lon = urlParams.searchParams.get('lon');
      
      if (!lat || !lon) {
        // Fallback: try to parse from the HTML response
        const html = response.data;
        const coordMatch = html.match(/lat=([\-\d.]+)&(?:amp;)?lon=([\-\d.]+)/);
        
        if (!coordMatch) {
          throw new Error(`Unable to get coordinates for zip code ${zipCode}`);
        }
        
        const parsedLat = parseFloat(coordMatch[1]);
        const parsedLon = parseFloat(coordMatch[2]);
        
        return await this.getSeaState(parsedLat, parsedLon);
      }
      
      // Parse location name if available
      const cityName = urlParams.searchParams.get('CityName');
      
      // Get sea state for these coordinates
      const result = await this.getSeaState(parseFloat(lat), parseFloat(lon));
      
      if (cityName) {
        result.location.name = decodeURIComponent(cityName.replace(/\+/g, ' '));
      }
      
      return result;
    } catch (err) {
      if (err.message.includes('No marine data available for inland location')) {
        throw new Error(`Zip code ${zipCode} appears to be an inland location`);
      }
      if (err.response?.status === 404) {
        throw new Error(`Zip code ${zipCode} not found`);
      }
      throw new Error(`Failed to get data for zip code ${zipCode}: ${err.message}`);
    }
  }
  
  /**
   * Get sea state data for coordinates
   * @param {number} lat - Latitude  
   * @param {number} lon - Longitude
   * @returns {Object} Combined marine data from available sources
   */
  async getSeaState(lat, lon) {
    // Validate coastal location
    if (!this.validator.isCoastal(lat, lon)) {
      throw new Error('No marine data available for inland location');
    }
    
    const data = {
      location: { lat, lon },
      waves: null,
      wind: null,
      tides: null,
      sources: []
    };
    
    // Fetch wave data with fallbacks
    try {
      data.waves = await this._getWaveData(lat, lon);
      if (data.waves?.source) {
        data.sources.push(data.waves.source);
      }
    } catch (err) {
      console.error('Wave data error:', err.message);
    }
    
    // Fetch wind data with fallbacks
    try {
      data.wind = await this._getWindData(lat, lon);
      if (data.wind?.source && !data.sources.includes(data.wind.source)) {
        data.sources.push(data.wind.source);
      }
    } catch (err) {
      console.error('Wind data error:', err.message);
    }
    
    // Fetch tide data
    try {
      data.tides = await this.getTides(lat, lon);
      if (data.tides) {
        data.sources.push('CO-OPS');
      }
    } catch (err) {
      console.error('Tide data error:', err.message);
    }
    
    if (data.sources.length === 0) {
      throw new Error('No marine data available for this location');
    }
    
    return data;
  }
  

  
  /**
   * Get data from a specific NDBC buoy
   * @param {string} buoyId - NDBC buoy identifier
   * @returns {Object} Parsed buoy observations
   */
  async getBuoy(buoyId) {
    return await this.ndbc.getBuoyData(buoyId);
  }
  
  /**
   * Find available data sources near a location
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} radiusKm - Search radius in kilometers
   * @returns {Object} Nearby buoys, tide stations, and weather stations
   */
  async findSources(lat, lon, radiusKm = 100) {
    const sources = {
      location: { lat, lon },
      searchRadius: radiusKm,
      buoys: [],
      tideStations: [],
      weatherGrid: null
    };
    
    // Find all buoys within radius
    try {
      const nearbyBuoys = this.ndbc.findAllWithinRadius(lat, lon, radiusKm);
      sources.buoys = nearbyBuoys || [];
    } catch (err) {
      sources.buoys = [];
    }
    
    // Find all tide stations within radius
    try {
      const nearbyTides = this.tides.findAllWithinRadius(lat, lon, radiusKm);
      sources.tideStations = nearbyTides || [];
    } catch (err) {
      // If findAllWithinRadius doesn't exist, fall back to findNearest
      const nearestTide = this.tides.findNearest(lat, lon, radiusKm);
      if (nearestTide) {
        sources.tideStations.push(nearestTide);
      }
    }
    
    // Get NWS grid point
    try {
      const grid = await this.nws.getGridpoint(lat, lon);
      sources.weatherGrid = grid;
    } catch (err) {
      sources.weatherGrid = { error: err.message };
    }
    
    return sources;
  }
  
  /**
   * Get tide predictions for a location
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {Object} options - Options for tide predictions
   * @returns {Object} Tide predictions and current state
   */
  async getTides(lat, lon, options = {}) {
    return await this.tides.getNearestTideData(lat, lon, {
      units: this.units,
      ...options
    });
  }
  
  /**
   * Get weather forecast and conditions from NWS
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Object} NWS weather data including current conditions and forecast
   */
  async getWeather(lat, lon) {
    return await this.weather.getWeather(lat, lon);
  }
  
  /**
   * Get weather alerts for a location
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Array} Active weather alerts
   */
  async getWeatherAlerts(lat, lon) {
    return await this.weather.getAlerts(lat, lon);
  }
  
  // Private methods for data fetching with fallbacks
  async _getWaveData(lat, lon) {
    // Try NDBC first (real observations)
    try {
      // Get all buoys within 30km
      const nearbyBuoys = this.ndbc.findAllWithinRadius(lat, lon, 30);
      const skippedBuoys = [];
      
      // Try each buoy until we find wave data
      for (const buoy of nearbyBuoys) {
        try {
          const data = await this.ndbc.getBuoyData(buoy.id);
          // Check if this buoy actually has wave data
          if (data.waves && (data.waves.height !== null || data.waves.period !== null)) {
            return {
              source: 'NDBC',
              station: buoy,
              stationId: buoy.id,
              stationName: buoy.name,
              distance: buoy.distance,
              height: data.waves?.height,
              period: data.waves?.period,
              averagePeriod: data.waves?.averagePeriod,  // Add average period!
              direction: data.waves?.direction,
              waterTemp: data.atmosphere?.waterTemp,
              skippedCloser: skippedBuoys,
              nearbyAlternatives: nearbyBuoys.filter(b => 
                b.id !== buoy.id && 
                b.distance > buoy.distance && 
                b.distance < buoy.distance + 15
              )
            };
          } else {
            // This buoy exists but has no wave data
            skippedBuoys.push({ id: buoy.id, distance: buoy.distance, reason: 'no wave data' });
          }
        } catch (err) {
          // This buoy failed to fetch
          skippedBuoys.push({ id: buoy.id, distance: buoy.distance, reason: 'offline' });
          continue;
        }
      }
    } catch (err) {
      // Fall through to NWS
    }
    
    // Fall back to NWS gridpoint forecast
    try {
      const forecast = await this.nws.getWaveForecast(lat, lon);
      return {
        source: 'NWS',
        ...forecast
      };
    } catch (err) {
      throw new Error('No wave data available');
    }
  }
  
  async _getWindData(lat, lon) {
    // Try NDBC first
    try {
      const nearbyBuoys = this.ndbc.findAllWithinRadius(lat, lon, 30);
      
      for (const buoy of nearbyBuoys) {
        try {
          const data = await this.ndbc.getBuoyData(buoy.id);
          // Check if wind data exists and has actual values (not null)
          if (data.wind && data.wind.speed !== null) {
            return {
              source: 'NDBC',
              station: `Buoy ${buoy.id}`,
              distance: buoy.distance,
              speed: data.wind.speed,
              direction: data.wind.direction,
              gusts: data.wind.gusts
            };
          }
        } catch (err) {
          continue;
        }
      }
    } catch (err) {
      // Fall through to NWS
    }
    
    // Fall back to NWS observation stations (not forecast)
    try {
      // Get the grid point
      const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
      const pointsResponse = await this.http.get(pointsUrl);
      
      if (!pointsResponse.data?.properties) {
        throw new Error('Invalid NWS response');
      }
      
      const { gridId, gridX, gridY } = pointsResponse.data.properties;
      
      // Get observation stations for this grid
      const stationsUrl = `https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}/stations`;
      const stationsResponse = await this.http.get(stationsUrl);
      
      if (stationsResponse.data?.features?.length > 0) {
        // Get the nearest station
        const stationId = stationsResponse.data.features[0].properties.stationIdentifier;
        
        // Get latest observations
        const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
        const obsResponse = await this.http.get(obsUrl);
        
        if (obsResponse.data?.properties) {
          const obs = obsResponse.data.properties;
          return {
            source: 'NWS-OBS',
            speed: obs.windSpeed?.value ? obs.windSpeed.value : null,
            direction: obs.windDirection?.value,
            gusts: obs.windGust?.value,
            station: stationId
          };
        }
      }
    } catch (err) {
      console.error('NWS observation error:', err.message);
    }
    
    // Last resort: try NWS forecast
    try {
      const weather = await this.getWeather(lat, lon);
      if (weather?.periods?.[0]) {
        const current = weather.periods[0];
        return {
          source: 'NWS-FORECAST',
          description: current.windSpeed,
          direction: current.windDirection
        };
      }
    } catch (err) {
      // Give up
    }
    
    throw new Error('No wind data available');
  }
}

module.exports = Buoyant;
