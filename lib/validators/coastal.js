/**
 * Coastal boundary validation
 * 
 * Because someone WILL try to get surf conditions for Denver.
 * This uses a "thick" outline around US coastal areas to validate
 * that coordinates are actually near water where NOAA has data.
 */

const fs = require('fs');
const path = require('path');

class CoastalValidator {
  constructor(options = {}) {
    this.boundaryPath = options.boundaryPath || 
      path.join(__dirname, '..', '..', 'data', 'coastal-boundary.json');
    
    this.boundary = null;
    this.enabled = options.enabled !== false; // Default enabled
    this.quiet = options.quiet || false;
    
    if (this.enabled) {
      this._loadBoundary();
    }
  }
  
  _loadBoundary() {
    try {
      if (fs.existsSync(this.boundaryPath)) {
        this.boundary = JSON.parse(fs.readFileSync(this.boundaryPath, 'utf8'));
        if (!this.quiet) {
          console.log('Loaded coastal boundary validation');
        }
      } else {
        if (!this.quiet) {
          console.warn('Coastal boundary file not found, validation disabled');
        }
        this.enabled = false;
      }
    } catch (err) {
      console.error('Failed to load coastal boundary:', err.message);
      this.enabled = false;
    }
  }
  
  /**
   * Check if coordinates are in a valid coastal area
   * @returns {boolean} true if valid coastal location
   */
  isCoastal(lat, lon) {
    if (!this.enabled || !this.boundary) {
      // If validation is disabled, assume all locations are valid
      return true;
    }
    
    // Simple point-in-polygon check
    // For now, just check rough bounds (we'll add proper polygon check later)
    return this._isInBounds(lat, lon) && this._isNearCoast(lat, lon);
  }
  
  /**
   * Rough bounding box check for US territories
   */
  _isInBounds(lat, lon) {
    // Continental US
    if (lat >= 24 && lat <= 49 && lon >= -125 && lon <= -66) return true;
    
    // Alaska
    if (lat >= 51 && lat <= 72 && lon >= -180 && lon <= -130) return true;
    
    // Hawaii
    if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return true;
    
    // Puerto Rico / USVI
    if (lat >= 17 && lat <= 19 && lon >= -68 && lon <= -64) return true;
    
    // Guam / Pacific territories
    if (lat >= 13 && lat <= 21 && lon >= 144 && lon <= 147) return true;
    
    return false;
  }
  
  /**
   * Simple "near coast" check
   * In production, this would use the actual polygon
   */
  _isNearCoast(lat, lon) {
    // For now, exclude obviously inland areas
    // This is hilariously crude but prevents Denver surf reports
    
    // Exclude middle of the country (roughly)
    if (lat >= 35 && lat <= 45 && lon >= -105 && lon <= -90) {
      return false; // Great Plains
    }
    
    if (lat >= 36 && lat <= 42 && lon >= -115 && lon <= -105) {
      return false; // Mountain West
    }
    
    // TODO: Implement proper point-in-polygon with the geojson
    // For now, this at least stops the most obvious abuse
    
    return true;
  }
  
  /**
   * Get a helpful error message for invalid locations
   */
  getErrorMessage(lat, lon) {
    if (!this._isInBounds(lat, lon)) {
      return 'Location is outside US coastal areas where NOAA provides marine data';
    }
    
    if (!this._isNearCoast(lat, lon)) {
      // Try to be helpful about what went wrong
      if (lon > -105 && lon < -90) {
        return "That's not the ocean, friend. Try a location near the coast.";
      }
      return 'Location appears to be inland. Marine data is only available for coastal areas.';
    }
    
    return 'Invalid coastal location';
  }
}

module.exports = CoastalValidator;
