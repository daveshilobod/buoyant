const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ngeohash = require('ngeohash');

/**
 * Client for NOAA CO-OPS (Tides and Currents) API
 * https://api.tidesandcurrents.noaa.gov/api/prod/
 */
class TideClient {
  constructor(options = {}) {
    this.baseUrl = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
    this.quiet = options.quiet || false;
    
    // Station data
    this.stationsPath = options.stationsPath || 
      path.join(__dirname, '..', '..', 'data', 'tide-stations.json');
    this.stations = [];
    
    this.http = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Buoyant'
      }
    });
    
    this._loadStations();
  }
  
  _loadStations() {
    try {
      // Load the geohash -> station ID mapping
      // The geohash itself contains the lat/lon, so we don't need separate coordinates
      const tideStationsPath = path.join(__dirname, '..', '..', 'data', 'tideDataStations.json');
      
      if (fs.existsSync(tideStationsPath)) {
        const geohashMapping = JSON.parse(fs.readFileSync(tideStationsPath, 'utf8'));
        
        // Convert geohash mapping to station array with decoded coordinates
        this.stations = [];
        for (const [geohash, stationId] of Object.entries(geohashMapping)) {
          const coords = ngeohash.decode(geohash);
          this.stations.push({
            id: stationId,
            geohash: geohash,
            lat: coords.latitude,
            lon: coords.longitude
          });
        }
        
        if (!this.quiet) {
          console.log(`Loaded ${this.stations.length} tide stations`);
        }
      } else if (fs.existsSync(this.stationsPath)) {
        const data = JSON.parse(fs.readFileSync(this.stationsPath, 'utf8'));
        // Handle both array and object formats
        this.stations = Array.isArray(data) ? data : Object.entries(data).map(([geohash, id]) => ({
          id,
          geohash
        }));
        console.log(`Loaded ${this.stations.length} tide stations`);
      } else {
        console.warn('Tide station file not found');
        // Hardcode a few major stations as fallback
        this.stations = [
          { id: '1612340', name: 'Honolulu', lat: 21.3067, lon: -157.8670 },
          { id: '9414290', name: 'San Francisco', lat: 37.8063, lon: -122.4659 },
          { id: '8723214', name: 'Virginia Key', lat: 25.7317, lon: -80.1617 },
          { id: '8518750', name: 'The Battery, NY', lat: 40.7006, lon: -74.0142 }
        ];
      }
    } catch (err) {
      console.error('Failed to load tide stations:', err.message);
      this.stations = [];
    }
  }
  
  /**
   * Find nearest tide station
   */
  findNearest(lat, lon, maxDistance = 100) {
    let nearest = null;
    let minDistance = maxDistance;
    
    for (const station of this.stations) {
      // Use the lat/lon we already decoded in _loadStations
      const stationLat = station.lat;
      const stationLon = station.lon;
      
      if (!stationLat || !stationLon) {
        continue;
      }
      
      const dist = this._haversine(lat, lon, stationLat, stationLon);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = { ...station, distance: dist };
      }
    }
    
    return nearest;
  }
  
  /**
   * Get tide predictions for a station
   */
  async getTidePredictions(stationId, options = {}) {
    const params = {
      station: stationId,
      product: 'predictions',
      datum: 'MLLW',
      time_zone: 'lst_ldt',
      interval: 'hilo',
      format: 'json',
      units: options.units === 'metric' ? 'metric' : 'english',
      date: options.date || 'today'
    };
    
    const queryString = Object.entries(params)
      .map(([key, val]) => `${key}=${encodeURIComponent(val)}`)
      .join('&');
    
    const url = `${this.baseUrl}?${queryString}`;
    
    try {
      const response = await this.http.get(url);
      
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }
      
      return this._parseTideData(response.data, options.units);
    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Tide station ${stationId} not found`);
      }
      throw err;
    }
  }
  
  /**
   * Get current water level (if available)
   */
  async getWaterLevel(stationId, options = {}) {
    const params = {
      station: stationId,
      product: 'water_level',
      datum: 'MLLW',
      time_zone: 'lst_ldt',
      format: 'json',
      units: options.units === 'metric' ? 'metric' : 'english',
      date: 'latest'
    };
    
    const queryString = Object.entries(params)
      .map(([key, val]) => `${key}=${encodeURIComponent(val)}`)
      .join('&');
    
    const url = `${this.baseUrl}?${queryString}`;
    
    try {
      const response = await this.http.get(url);
      
      if (response.data.error) {
        // Many stations don't have water level sensors
        return null;
      }
      
      const data = response.data.data;
      if (data && data.length > 0) {
        const latest = data[data.length - 1];
        return {
          height: parseFloat(latest.v),
          time: latest.t,
          units: options.units === 'metric' ? 'm' : 'ft'
        };
      }
      
      return null;
    } catch (err) {
      // Water level not available for many stations
      return null;
    }
  }
  
  /**
   * Get tide data for nearest station to coordinates
   */
  async getNearestTideData(lat, lon, options = {}) {
    const nearest = this.findNearest(lat, lon);
    
    if (!nearest) {
      throw new Error('No tide stations within range');
    }
    
    const predictions = await this.getTidePredictions(nearest.id, options);
    const waterLevel = await this.getWaterLevel(nearest.id, options);
    
    return {
      station: {
        id: nearest.id,
        name: nearest.name,
        distance: Math.round(nearest.distance * 10) / 10
      },
      predictions,
      current: waterLevel,
      units: options.units === 'metric' ? 'm' : 'ft'
    };
  }
  
  /**
   * Parse CO-OPS tide data format
   */
  _parseTideData(data, units) {
    if (!data.predictions || data.predictions.length === 0) {
      return [];
    }
    
    const tideUnit = units === 'metric' ? 'm' : 'ft';
    
    return data.predictions.map(pred => ({
      time: pred.t,
      height: parseFloat(pred.v),
      type: pred.type === 'H' ? 'high' : 'low',
      units: tideUnit
    }));
  }
  
  /**
   * Get tide state (rising/falling) based on predictions
   */
  getTideState(predictions, currentTime = new Date()) {
    if (!predictions || predictions.length < 2) {
      return 'unknown';
    }
    
    // Find where we are in the tide cycle
    const now = currentTime.getTime();
    
    for (let i = 0; i < predictions.length - 1; i++) {
      const current = new Date(predictions[i].time).getTime();
      const next = new Date(predictions[i + 1].time).getTime();
      
      if (now >= current && now <= next) {
        // We're between these two tide events
        const currentType = predictions[i].type;
        const nextType = predictions[i + 1].type;
        
        if (currentType === 'low' && nextType === 'high') {
          return 'rising';
        } else if (currentType === 'high' && nextType === 'low') {
          return 'falling';
        }
      }
    }
    
    return 'unknown';
  }
  
  _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

module.exports = TideClient;
