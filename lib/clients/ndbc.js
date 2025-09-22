const axios = require('axios');
const fs = require('fs');
const path = require('path');
const geofire = require('geofire-common');

/**
 * Client for fetching and parsing NDBC buoy data
 */
class NDBCClient {
  constructor(options = {}) {
    this.baseUrl = 'https://www.ndbc.noaa.gov/data/realtime2/';
    this.quiet = options.quiet || false;
    
    // Station data source - use the full NDBC station list
    this.stationsPath = options.stationsPath || path.join(__dirname, '..', '..', 'data', 'ndbc-stations.json');
    this.stations = [];
    
    this.http = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Buoyant'
      }
    });
    
    this._loadStations();
  }
  
  /**
   * Load station data from file or CDN
   */
  _loadStations() {
    try {
      // Try multiple station files in order of preference
      const possiblePaths = [
        path.join(__dirname, '..', '..', 'data', 'ndbc-stations.json'),
        path.join(__dirname, '..', '..', 'data', 'spectralWaveDataBuoys.json'),
        path.join(__dirname, '..', '..', 'data', 'stations-minimal.json')
      ];
      
      for (const stationPath of possiblePaths) {
        if (fs.existsSync(stationPath)) {
          const data = JSON.parse(fs.readFileSync(stationPath, 'utf8'));
          
          // Handle different formats
          if (Array.isArray(data)) {
            // Direct array of stations
            this.stations = data.map(s => ({
              id: s.id,
              name: s.name,
              lat: parseFloat(s.lat || s.latitude),
              lon: parseFloat(s.lon || s.longitude)
            }));
          } else if (data.buoys) {
            // Wrapped in buoys property
            this.stations = data.buoys;
          }
          
          if (!this.quiet) {
            console.log(`Loaded ${this.stations.length} NDBC stations from ${path.basename(stationPath)}`);
          }
          break;
        }
      }
      
      if (this.stations.length === 0) {
        console.warn('No station files found, using minimal fallback');
        this.stations = [
          { id: '51201', name: 'Waimea Bay', lat: 21.673, lon: -158.116 },
          { id: '46042', name: 'Monterey Bay', lat: 36.785, lon: -122.398 },
          { id: '46026', name: 'San Francisco', lat: 37.759, lon: -122.833 }
        ];
      }
    } catch (err) {
      console.error('Failed to load stations:', err.message);
      this.stations = [];
    }
  }
  
  /**
   * Find all buoys within radius, sorted by distance
   */
  findAllWithinRadius(lat, lon, maxDistance = 100) {
    const nearbyBuoys = [];
    
    for (const station of this.stations) {
      const dist = geofire.distanceBetween([lat, lon], [station.lat, station.lon]);
      if (dist < maxDistance) {
        nearbyBuoys.push({ ...station, distance: dist });
      }
    }
    
    // Sort by distance
    nearbyBuoys.sort((a, b) => a.distance - b.distance);
    return nearbyBuoys;
  }
  
  /**
   * Find nearest buoy to given coordinates
   */
  findNearest(lat, lon, maxDistance = 100) {
    const allNearby = this.findAllWithinRadius(lat, lon, maxDistance);
    return allNearby.length > 0 ? allNearby[0] : null;
  }
  
  /**
   * Get spectral wave data from a buoy (if available)
   * This includes swell height, period, direction, and steepness
   */
  async getBuoySpectralData(buoyId) {
    try {
      const url = `${this.baseUrl}${buoyId}.spec`;
      const response = await this.http.get(url);
      
      if (!response.data) {
        throw new Error('No spectral data available');
      }
      
      return this._parseSpectralData(response.data, buoyId);
    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Spectral data not available for buoy ${buoyId}`);
      }
      throw err;
    }
  }
  
  /**
   * Parse NDBC spectral data (.spec format)
   * Contains swell components and wave steepness
   */
  _parseSpectralData(text, buoyId) {
    const lines = text.trim().split('\n');
    
    if (lines.length < 3) {
      throw new Error('Invalid spectral data format');
    }
    
    // Headers: YY MM DD hh mm WVHT SwH SwP WWH WWP SwD WWD STEEPNESS APD MWD
    const headers = lines[0].replace('#', '').trim().split(/\s+/);
    const latestDataLine = lines[2];
    
    if (!latestDataLine) {
      throw new Error('No recent spectral data');
    }
    
    const values = latestDataLine.trim().split(/\s+/);
    
    // Map values to headers
    const data = {};
    headers.forEach((header, i) => {
      const value = values[i];
      if (value && value !== 'MM' && value !== 'N/A') {
        // Keep steepness as string, parse numbers for everything else
        if (header === 'STEEPNESS') {
          data[header] = value;
        } else {
          const parsed = parseFloat(value);
          if (!isNaN(parsed)) {
            data[header] = parsed;
          }
        }
      }
    });
    
    // Parse timestamp
    let year = data.YY || data['#YY'];
    if (year < 100) {
      year = 2000 + year;
    }
    const month = parseInt(data.MM) - 1;
    const day = parseInt(data.DD);
    const hour = parseInt(data.hh);
    const minute = parseInt(data.mm);
    
    const timestamp = new Date(Date.UTC(year, month, day, hour, minute));
    
    // Parse cardinal directions for swell/wind wave
    const parseDirection = (dir) => {
      if (!dir || dir === 'N') return null;
      if (typeof dir === 'number') return dir;
      // Convert cardinal to degrees if needed
      const cardinalToDegrees = {
        'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
        'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
        'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
        'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
      };
      return cardinalToDegrees[dir] || null;
    };
    
    return {
      timestamp: timestamp.toISOString(),
      waves: {
        height: data.WVHT || null,
        dominantPeriod: data.DPD || null,  // This is what surfers care about
        averagePeriod: data.APD || null,    // Important for wave quality
        direction: data.MWD || null
      },
      swell: {
        height: data.SwH || null,
        period: data.SwP || null,
        direction: parseDirection(data.SwD)
      },
      windWaves: {
        height: data.WWH || null,
        period: data.WWP || null,
        direction: parseDirection(data.WWD)
      },
      steepness: data.STEEPNESS || null,
      averagePeriod: data.APD || null  // Keep for backwards compat
    };
  }
  /**
   * Get historical data from a buoy (last N observations)
   * @param {string} buoyId - NDBC buoy identifier
   * @param {number} count - Number of observations to return (default 5)
   * @returns {Array} Array of parsed observations, newest first
   */
  async getBuoyHistory(buoyId, count = 5) {
    try {
      const url = `${this.baseUrl}${buoyId}.txt`;
      const response = await this.http.get(url);
      
      if (!response.data) {
        throw new Error('No data received from buoy');
      }
      
      return this._parseHistoricalData(response.data, buoyId, count);
    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Buoy ${buoyId} not found or offline`);
      }
      throw err;
    }
  }
  
  /**
   * Parse multiple observations from NDBC text format
   */
  _parseHistoricalData(text, buoyId, count) {
    const lines = text.trim().split('\n');
    
    if (lines.length < 3) {
      throw new Error('Invalid buoy data format');
    }
    
    const headers = lines[0].replace('#', '').trim().split(/\s+/);
    const observations = [];
    
    // Parse up to 'count' observations (starting from line 2)
    const maxLines = Math.min(lines.length - 2, count);
    
    for (let i = 2; i < 2 + maxLines; i++) {
      const dataLine = lines[i];
      if (!dataLine) continue;
      
      const values = dataLine.trim().split(/\s+/);
      
      // Build data object for this observation
      const data = {};
      headers.forEach((header, idx) => {
        const value = values[idx];
        if (value && value !== 'MM') {
          data[header] = parseFloat(value) || value;
        }
      });
      
      // Parse timestamp
      let year = data.YY || data['#YY'];
      if (year < 100) {
        year = 2000 + year;
      }
      const month = parseInt(data.MM) - 1;
      const day = parseInt(data.DD);
      const hour = parseInt(data.hh);
      const minute = parseInt(data.mm);
      
      const timestamp = new Date(Date.UTC(year, month, day, hour, minute));
      
      observations.push({
        timestamp: timestamp.toISOString(),
        waves: {
          height: data.WVHT !== undefined && data.WVHT !== 99 ? data.WVHT : null,
          period: data.DPD !== undefined && data.DPD !== 99 ? data.DPD : null,
          direction: data.MWD !== undefined && data.MWD !== 999 ? data.MWD : null
        },
        wind: {
          speed: data.WSPD !== undefined && data.WSPD !== 99 ? data.WSPD : null,
          direction: data.WDIR !== undefined && data.WDIR !== 999 ? data.WDIR : null,
          gusts: data.GST !== undefined && data.GST !== 99 ? data.GST : null
        },
        atmosphere: {
          waterTemp: data.WTMP !== undefined && data.WTMP !== 999 ? data.WTMP : null,
          airTemp: data.ATMP !== undefined && data.ATMP !== 999 ? data.ATMP : null
        }
      });
    }
    
    return observations;
  }
  
  async getBuoyData(buoyId) {
    try {
      const url = `${this.baseUrl}${buoyId}.txt`;
      const response = await this.http.get(url);
      
      if (!response.data) {
        throw new Error('No data received from buoy');
      }
      
      return this._parseTextData(response.data, buoyId);
    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Buoy ${buoyId} not found or offline`);
      }
      throw err;
    }
  }
  
  /**
   * Get data from nearest buoy to coordinates
   */
  async getNearestBuoyData(lat, lon) {
    const nearest = this.findNearest(lat, lon);
    
    if (!nearest) {
      throw new Error('No buoys within range');
    }
    
    const data = await this.getBuoyData(nearest.id);
    
    return {
      ...data,
      station: {
        id: nearest.id,
        name: nearest.name,
        distance: Math.round(nearest.distance * 10) / 10
      }
    };
  }
  
  /**
   * Parse NDBC text format
   * Format: https://www.ndbc.noaa.gov/measdes.shtml
   */
  _parseTextData(text, buoyId) {
    const lines = text.trim().split('\n');
    
    if (lines.length < 3) {
      throw new Error('Invalid buoy data format');
    }
    
    // Line 0: Headers (YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE)
    // Line 1: Units   (#yr mo dy hr mn degT m/s m/s m sec sec degT hPa degC degC degC nmi hPa ft)
    // Line 2+: Data
    
    const headers = lines[0].replace('#', '').trim().split(/\s+/);
    const latestDataLine = lines[2]; // Most recent observation
    
    if (!latestDataLine) {
      throw new Error('No recent data available');
    }
    
    const values = latestDataLine.trim().split(/\s+/);
    
    // Build data object
    const data = {};
    headers.forEach((header, i) => {
      const value = values[i];
      if (value && value !== 'MM') { // MM = missing data
        data[header] = parseFloat(value) || value;
      }
    });
    
    // Parse timestamp - handle both 2-digit and 4-digit years
    let year = data.YY || data['#YY'];
    if (year < 100) {
      year = 2000 + year; // Convert 2-digit year to 4-digit
    }
    const month = parseInt(data.MM) - 1; // JS months are 0-indexed
    const day = parseInt(data.DD);
    const hour = parseInt(data.hh);
    const minute = parseInt(data.mm);
    
    const timestamp = new Date(Date.UTC(year, month, day, hour, minute));
    
    // Return formatted data
    return {
      timestamp: timestamp.toISOString(),
      waves: {
        height: data.WVHT !== undefined && data.WVHT !== 99 ? data.WVHT : null,
        period: data.DPD !== undefined && data.DPD !== 99 ? data.DPD : null,
        direction: data.MWD !== undefined && data.MWD !== 999 ? data.MWD : null,
        averagePeriod: data.APD !== undefined && data.APD !== 99 ? data.APD : null
      },
      wind: {
        speed: data.WSPD !== undefined && data.WSPD !== 99 ? data.WSPD : null,
        direction: data.WDIR !== undefined && data.WDIR !== 999 ? data.WDIR : null,
        gusts: data.GST !== undefined && data.GST !== 99 ? data.GST : null
      },
      atmosphere: {
        pressure: data.PRES !== undefined && data.PRES !== 9999 ? data.PRES : null,
        airTemp: data.ATMP !== undefined && data.ATMP !== 999 ? data.ATMP : null,
        waterTemp: data.WTMP !== undefined && data.WTMP !== 999 ? data.WTMP : null,
        dewPoint: data.DEWP !== undefined && data.DEWP !== 999 ? data.DEWP : null,
        visibility: data.VIS !== undefined && data.VIS !== 99 ? data.VIS : null,
        pressureTendency: data.PTDY !== undefined && data.PTDY !== 99 ? data.PTDY : null
      },
      tide: data.TIDE !== undefined && data.TIDE !== 99 ? data.TIDE : null
    };
  }
  

}

module.exports = NDBCClient;
