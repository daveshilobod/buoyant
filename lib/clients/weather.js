const axios = require('axios');

/**
 * NWS Weather Client
 * Fetches current conditions and forecasts from National Weather Service
 */
class WeatherClient {
  constructor(options = {}) {
    this.baseUrl = 'https://api.weather.gov';
    this.quiet = options.quiet || false;
    
    this.http = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Buoyant'
      }
    });
  }

  /**
   * Get weather data for coordinates
   * @returns {Object} Current conditions and forecast
   */
  async getWeather(lat, lon) {
    try {
      // First get the gridpoint
      const gridpoint = await this.getGridpoint(lat, lon);
      
      // Fetch current observations and forecast in parallel
      const [observations, forecast, hourly] = await Promise.all([
        this.getCurrentObservations(gridpoint.observationStations),
        this.getForecast(gridpoint),
        this.getHourlyForecast(gridpoint)
      ]);
      
      return {
        current: observations,
        forecast: forecast,
        hourly: hourly.slice(0, 12), // Next 12 hours
        gridpoint: {
          office: gridpoint.gridId,
          x: gridpoint.gridX,
          y: gridpoint.gridY
        }
      };
    } catch (err) {
      if (!this.quiet) {
        console.error('Weather fetch error:', err.message);
      }
      throw new Error(`Failed to fetch weather data: ${err.message}`);
    }
  }

  /**
   * Get gridpoint info for coordinates
   */
  async getGridpoint(lat, lon) {
    const response = await this.http.get(`${this.baseUrl}/points/${lat},${lon}`);
    
    if (!response.data?.properties) {
      throw new Error('Invalid gridpoint response');
    }
    
    const props = response.data.properties;
    return {
      gridId: props.gridId,
      gridX: props.gridX,
      gridY: props.gridY,
      observationStations: props.observationStations,
      forecastUrl: props.forecast,
      forecastHourlyUrl: props.forecastHourly
    };
  }

  /**
   * Get current observations from nearest station
   */
  async getCurrentObservations(stationsUrl) {
    try {
      // Get list of observation stations
      const stationsResponse = await this.http.get(stationsUrl);
      const stations = stationsResponse.data?.features || [];
      
      if (stations.length === 0) {
        return null;
      }
      
      // Try stations in order until we get valid observations
      for (const station of stations.slice(0, 3)) { // Try first 3 stations
        try {
          const stationId = station.properties.stationIdentifier;
          const obsUrl = `${this.baseUrl}/stations/${stationId}/observations/latest`;
          const obsResponse = await this.http.get(obsUrl);
          
          const obs = obsResponse.data?.properties;
          if (obs && obs.temperature?.value !== null) {
            return this.formatObservations(obs, stationId);
          }
        } catch (err) {
          // Try next station
          continue;
        }
      }
      
      return null;
    } catch (err) {
      if (!this.quiet) {
        console.error('Failed to get observations:', err.message);
      }
      return null;
    }
  }

  /**
   * Format raw observations into clean structure
   */
  formatObservations(obs, stationId) {
    return {
      station: stationId,
      timestamp: obs.timestamp,
      temperature: obs.temperature?.value ? 
        Math.round(obs.temperature.value * 1.8 + 32) : null, // Convert C to F
      temperatureC: obs.temperature?.value,
      description: obs.textDescription,
      windSpeed: obs.windSpeed?.value ? 
        (obs.windSpeed.value * 2.237).toFixed(1) : null, // m/s to mph
      windSpeedMs: obs.windSpeed?.value,
      windDirection: obs.windDirection?.value,
      windGust: obs.windGust?.value ? 
        (obs.windGust.value * 2.237).toFixed(1) : null,
      windGustMs: obs.windGust?.value,
      barometricPressure: obs.barometricPressure?.value,
      seaLevelPressure: obs.seaLevelPressure?.value,
      visibility: obs.visibility?.value ? 
        (obs.visibility.value / 1609).toFixed(1) : null, // meters to miles
      relativeHumidity: obs.relativeHumidity?.value ? 
        Math.round(obs.relativeHumidity.value) : null,
      dewpoint: obs.dewpoint?.value ? 
        Math.round(obs.dewpoint.value * 1.8 + 32) : null,
      heatIndex: obs.heatIndex?.value ? 
        Math.round(obs.heatIndex.value * 1.8 + 32) : null
    };
  }

  /**
   * Get 7-day forecast
   */
  async getForecast(gridpoint) {
    try {
      const url = `${this.baseUrl}/gridpoints/${gridpoint.gridId}/${gridpoint.gridX},${gridpoint.gridY}/forecast`;
      const response = await this.http.get(url);
      
      const periods = response.data?.properties?.periods || [];
      
      return periods.map(period => ({
        number: period.number,
        name: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        isDaytime: period.isDaytime,
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit,
        temperatureTrend: period.temperatureTrend,
        windSpeed: period.windSpeed,
        windDirection: period.windDirection,
        icon: period.icon,
        shortForecast: period.shortForecast,
        detailedForecast: period.detailedForecast,
        probabilityOfPrecipitation: period.probabilityOfPrecipitation?.value || 0
      }));
    } catch (err) {
      if (!this.quiet) {
        console.error('Failed to get forecast:', err.message);
      }
      return [];
    }
  }

  /**
   * Get hourly forecast
   */
  async getHourlyForecast(gridpoint) {
    try {
      const url = `${this.baseUrl}/gridpoints/${gridpoint.gridId}/${gridpoint.gridX},${gridpoint.gridY}/forecast/hourly`;
      const response = await this.http.get(url);
      
      const periods = response.data?.properties?.periods || [];
      
      return periods.map(period => ({
        startTime: period.startTime,
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit,
        windSpeed: period.windSpeed,
        windDirection: period.windDirection,
        shortForecast: period.shortForecast,
        probabilityOfPrecipitation: period.probabilityOfPrecipitation?.value || 0
      }));
    } catch (err) {
      if (!this.quiet) {
        console.error('Failed to get hourly forecast:', err.message);
      }
      return [];
    }
  }

  /**
   * Get active weather alerts for a point
   */
  async getAlerts(lat, lon) {
    try {
      const url = `${this.baseUrl}/alerts/active?point=${lat},${lon}`;
      const response = await this.http.get(url);
      
      const alerts = response.data?.features || [];
      
      return alerts.map(alert => ({
        id: alert.properties.id,
        areaDesc: alert.properties.areaDesc,
        severity: alert.properties.severity,
        certainty: alert.properties.certainty,
        urgency: alert.properties.urgency,
        event: alert.properties.event,
        headline: alert.properties.headline,
        description: alert.properties.description,
        instruction: alert.properties.instruction,
        effective: alert.properties.effective,
        expires: alert.properties.expires,
        onset: alert.properties.onset
      }));
    } catch (err) {
      if (!this.quiet) {
        console.error('Failed to get alerts:', err.message);
      }
      return [];
    }
  }
}

module.exports = WeatherClient;
