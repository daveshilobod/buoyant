/**
 * Station Data Loader
 * 
 * Handles loading the full NDBC/COOPS station data that makes
 * this library actually useful. The data can come from:
 * 1. Local files (if included in npm package)
 * 2. CDN/GitHub (downloaded on first use)
 * 3. User-provided data
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

class StationDataLoader {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.cdnBaseUrl = options.cdnBaseUrl || 
      null;
    
    // Track what's loaded
    this.loaded = {
      ndbc: false,
      tides: false,
      coastal: false
    };
    
    this.stationData = {
      ndbc: [],
      tides: [],
      coastal: null
    };
  }
  
  /**
   * Load all station data
   */
  async loadAll() {
    console.log('Loading station data...');
    
    await Promise.all([
      this.loadNDBCStations(),
      this.loadTideStations(),
      this.loadCoastalBoundary()
    ]);
    
    console.log(`✓ Loaded ${this.stationData.ndbc.length} NDBC buoys`);
    console.log(`✓ Loaded ${this.stationData.tides.length} tide stations`);
    console.log(`✓ Loaded coastal boundary ${this.stationData.coastal ? '✓' : '✗'}`);
    
    return true;
  }
  
  /**
   * Load NDBC station data
   */
  async loadNDBCStations() {
    // Try local file first
    const localFile = path.join(this.dataDir, 'ndbc-stations.json');
    
    if (fs.existsSync(localFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
        this.stationData.ndbc = data;
        this.loaded.ndbc = true;
        return data;
      } catch (err) {
        console.warn('Failed to load local NDBC data:', err.message);
      }
    }
    
    // Try downloading from CDN
    try {
      console.log('Downloading NDBC station data from CDN...');
      const response = await axios.get(this.cdnBaseUrl + 'ndbc-stations.json');
      
      if (response.data && Array.isArray(response.data)) {
        this.stationData.ndbc = response.data;
        this.loaded.ndbc = true;
        
        // Save locally for next time
        this._saveLocal('ndbc-stations.json', response.data);
        
        return response.data;
      }
    } catch (err) {
      console.warn('Failed to download NDBC data:', err.message);
    }
    
    // Fall back to minimal hardcoded list
    console.warn('Using minimal NDBC station list (full data not available)');
    this.stationData.ndbc = this._getMinimalNDBCStations();
    this.loaded.ndbc = true;
    
    return this.stationData.ndbc;
  }
  
  /**
   * Load tide station data
   */
  async loadTideStations() {
    const localFile = path.join(this.dataDir, 'tide-stations.json');
    
    if (fs.existsSync(localFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
        this.stationData.tides = data;
        this.loaded.tides = true;
        return data;
      } catch (err) {
        console.warn('Failed to load local tide data:', err.message);
      }
    }
    
    // Try downloading
    try {
      console.log('Downloading tide station data from CDN...');
      const response = await axios.get(this.cdnBaseUrl + 'tide-stations.json');
      
      if (response.data) {
        this.stationData.tides = response.data;
        this.loaded.tides = true;
        
        // Save locally
        this._saveLocal('tide-stations.json', response.data);
        
        return response.data;
      }
    } catch (err) {
      console.warn('Failed to download tide data:', err.message);
    }
    
    // Minimal fallback
    this.stationData.tides = this._getMinimalTideStations();
    this.loaded.tides = true;
    
    return this.stationData.tides;
  }
  
  /**
   * Load coastal boundary
   */
  async loadCoastalBoundary() {
    const localFile = path.join(this.dataDir, 'coastal-boundary.json');
    
    if (fs.existsSync(localFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
        this.stationData.coastal = data;
        this.loaded.coastal = true;
        return data;
      } catch (err) {
        console.warn('Failed to load coastal boundary:', err.message);
      }
    }
    
    // Coastal boundary is optional - just affects validation
    this.loaded.coastal = false;
    return null;
  }
  
  /**
   * Save data locally for caching
   */
  _saveLocal(filename, data) {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(this.dataDir, filename),
        JSON.stringify(data, null, 2)
      );
    } catch (err) {
      // Non-fatal, just means we'll download again next time
      console.warn(`Failed to cache ${filename}:`, err.message);
    }
  }
  
  /**
   * Minimal station lists for fallback
   */
  _getMinimalNDBCStations() {
    return [
      // Hawaii
      { id: "51201", name: "Waimea Bay, HI", lat: 21.673, lon: -158.116 },
      { id: "51202", name: "Mokapu Point, HI", lat: 21.417, lon: -157.668 },
      { id: "51204", name: "Pearl Harbor, HI", lat: 21.414, lon: -157.935 },
      
      // California
      { id: "46011", name: "Santa Maria, CA", lat: 35.0, lon: -120.992 },
      { id: "46012", name: "Half Moon Bay, CA", lat: 37.363, lon: -122.881 },
      { id: "46026", name: "San Francisco, CA", lat: 37.759, lon: -122.833 },
      { id: "46047", name: "Tanner Banks, CA", lat: 32.433, lon: -119.533 },
      { id: "46086", name: "San Clemente, CA", lat: 32.491, lon: -118.034 },
      
      // East Coast
      { id: "44013", name: "Boston, MA", lat: 42.346, lon: -70.651 },
      { id: "44017", name: "Montauk, NY", lat: 40.694, lon: -72.048 },
      { id: "44025", name: "Long Island, NY", lat: 40.251, lon: -73.164 },
      { id: "41001", name: "Cape Hatteras, NC", lat: 34.7, lon: -72.73 },
      { id: "41004", name: "Cape Canaveral, FL", lat: 32.501, lon: -79.099 },
      
      // Gulf
      { id: "42001", name: "Southwest Pass, LA", lat: 25.897, lon: -89.668 },
      { id: "42003", name: "East Gulf", lat: 26.044, lon: -85.612 },
      
      // Pacific Northwest
      { id: "46041", name: "Cape Elizabeth, WA", lat: 47.353, lon: -124.731 },
      { id: "46029", name: "Columbia River, OR", lat: 46.144, lon: -124.485 }
    ];
  }
  
  _getMinimalTideStations() {
    return [
      { id: "1612340", name: "Honolulu", lat: 21.3067, lon: -157.8670 },
      { id: "9414290", name: "San Francisco", lat: 37.8063, lon: -122.4659 },
      { id: "8518750", name: "The Battery, NY", lat: 40.7006, lon: -74.0142 },
      { id: "8723214", name: "Virginia Key, FL", lat: 25.7317, lon: -80.1617 },
      { id: "9410230", name: "La Jolla, CA", lat: 32.8669, lon: -117.2571 }
    ];
  }
  
  /**
   * Get station counts
   */
  getStats() {
    return {
      ndbc: {
        loaded: this.loaded.ndbc,
        count: this.stationData.ndbc.length,
        full: this.stationData.ndbc.length > 100
      },
      tides: {
        loaded: this.loaded.tides,
        count: this.stationData.tides.length,
        full: this.stationData.tides.length > 100
      },
      coastal: {
        loaded: this.loaded.coastal,
        available: this.stationData.coastal !== null
      },
      total: this.stationData.ndbc.length + this.stationData.tides.length
    };
  }
}

module.exports = StationDataLoader;
