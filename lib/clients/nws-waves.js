const axios = require('axios');

/**
 * NWS Gridpoint Wave Forecast Client
 * 
 * The NWS API is... special. Some gridpoints have marine/wave data, some don't.
 * There's no way to know without trying. So we search in an expanding ring
 * pattern until we find data or give up.
 * 
 * This is adapted from production code that actually worked, so don't judge.
 */
class NWSWaveClient {
  constructor(options = {}) {
    this.baseUrl = 'https://api.weather.gov';
    this.maxRetries = options.maxRetries || 3;
    this.searchRadius = options.searchRadius || 2; // How far to search from center
    
    this.http = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Buoyant'
      }
    });
    
    // Wave-related properties we're looking for
    this.waveProperties = [
      'waveHeight',
      'wavePeriod', 
      'waveDirection',
      'primarySwellHeight',
      'primarySwellDirection',
      'secondarySwellHeight',
      'secondarySwellDirection',
      'wavePeriod2',
      'windWaveHeight'
    ];
  }
  
  /**
   * Get gridpoint info for coordinates
   */
  async getGridpoint(lat, lon) {
    try {
      const response = await this.http.get(`${this.baseUrl}/points/${lat},${lon}`);
      
      if (!response.data?.properties) {
        throw new Error('Invalid gridpoint response');
      }
      
      const { gridId, gridX, gridY } = response.data.properties;
      
      return { gridId, gridX, gridY };
    } catch (err) {
      throw new Error(`Failed to get gridpoint: ${err.message}`);
    }
  }
  
  /**
   * Try to fetch wave data from a specific gridpoint
   */
  async fetchGridpointData(gridId, x, y) {
    const url = `${this.baseUrl}/gridpoints/${gridId}/${x},${y}`;
    
    try {
      const response = await this.http.get(url);
      
      if (!response.data?.properties) {
        return null;
      }
      
      // Check if this gridpoint has any wave data
      const hasWaveData = this.waveProperties.some(prop => 
        response.data.properties[prop] && 
        response.data.properties[prop].values &&
        response.data.properties[prop].values.length > 0
      );
      
      if (!hasWaveData) {
        return null;
      }
      
      return response.data.properties;
    } catch (err) {
      // 500 errors are common for gridpoints without marine data
      if (err.response?.status === 500) {
        return null;
      }
      
      // 404 means gridpoint doesn't exist
      if (err.response?.status === 404) {
        return null;
      }
      
      // Other errors we might want to retry
      console.warn(`Gridpoint ${x},${y} failed:`, err.message);
      return null;
    }
  }
  
  /**
   * Search for wave data in expanding rings around center point
   * This is the hacky magic that makes it work
   */
  async searchForWaveData(gridId, centerX, centerY) {
    console.log(`Searching for wave data around ${gridId} ${centerX},${centerY}`);
    
    // Ring 1: Center point + immediate neighbors (9 points)
    const innerRing = [
      [centerX, centerY],           // Center
      [centerX - 1, centerY],        // West
      [centerX + 1, centerY],        // East
      [centerX, centerY - 1],        // South
      [centerX, centerY + 1],        // North
      [centerX - 1, centerY + 1],    // NW
      [centerX + 1, centerY - 1],    // SE
      [centerX + 1, centerY + 1],    // NE
      [centerX - 1, centerY - 1]     // SW
    ];
    
    // Try inner ring first
    for (const [x, y] of innerRing) {
      const data = await this.fetchGridpointData(gridId, x, y);
      if (data) {
        console.log(`Found wave data at offset (${x - centerX}, ${y - centerY})`);
        return { data, gridpoint: { x, y } };
      }
    }
    
    // Ring 2: Outer ring (12 more points)
    const outerRing = [
      [centerX - 2, centerY],        // Far west
      [centerX + 2, centerY],        // Far east
      [centerX, centerY - 2],        // Far south
      [centerX, centerY + 2],        // Far north
      [centerX - 1, centerY - 2],
      [centerX + 1, centerY + 2],
      [centerX - 1, centerY + 2],
      [centerX + 1, centerY - 2],
      [centerX - 2, centerY - 1],
      [centerX + 2, centerY + 1],
      [centerX - 2, centerY + 1],
      [centerX + 2, centerY - 1]
    ];
    
    console.log('No data in inner ring, trying outer ring...');
    
    for (const [x, y] of outerRing) {
      const data = await this.fetchGridpointData(gridId, x, y);
      if (data) {
        console.log(`Found wave data at offset (${x - centerX}, ${y - centerY})`);
        return { data, gridpoint: { x, y } };
      }
    }
    
    console.log('No wave data found in any nearby gridpoints');
    return null;
  }
  
  /**
   * Get wave forecast for coordinates
   */
  async getWaveForecast(lat, lon) {
    // First get the gridpoint
    const { gridId, gridX, gridY } = await this.getGridpoint(lat, lon);
    
    // Search for wave data
    const result = await this.searchForWaveData(gridId, gridX, gridY);
    
    if (!result) {
      throw new Error('No wave data available for this location');
    }
    
    // Parse the wave data
    return this.parseWaveData(result.data, result.gridpoint);
  }
  
  /**
   * Parse NWS gridpoint wave data into usable format
   */
  parseWaveData(properties, gridpoint) {
    const now = new Date();
    const waveData = {
      source: 'NWS',
      gridpoint: `${gridpoint.x},${gridpoint.y}`,
      timestamp: now.toISOString(),
      current: {},
      forecast: {}
    };
    
    // Extract current and next 24hr values for each property
    this.waveProperties.forEach(prop => {
      if (!properties[prop] || !properties[prop].values) {
        return;
      }
      
      const values = properties[prop].values;
      const uom = properties[prop].uom;
      
      // Find current value (time period containing now)
      const current = values.find(v => {
        const [startStr, durationStr] = v.validTime.split('/');
        const start = new Date(startStr);
        const duration = this.parseDuration(durationStr);
        const end = new Date(start.getTime() + duration);
        return now >= start && now <= end;
      });
      
      // Find next value
      const next = values.find(v => {
        const [startStr] = v.validTime.split('/');
        const start = new Date(startStr);
        return start > now;
      });
      
      if (current) {
        waveData.current[prop] = {
          value: current.value,
          units: this.parseUnits(uom)
        };
      }
      
      if (next) {
        waveData.forecast[prop] = {
          value: next.value,
          units: this.parseUnits(uom),
          validTime: next.validTime
        };
      }
    });
    
    // Convert to more readable format
    return this.formatWaveData(waveData);
  }
  
  /**
   * Parse ISO 8601 duration (e.g., "PT6H" = 6 hours)
   */
  parseDuration(durationStr) {
    if (!durationStr) return 0;
    
    const match = durationStr.match(/PT?(\d+)([DHMS])/);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'D': return value * 24 * 60 * 60 * 1000;
      case 'H': return value * 60 * 60 * 1000;
      case 'M': return value * 60 * 1000;
      case 'S': return value * 1000;
      default: return 0;
    }
  }
  
  /**
   * Parse NWS unit notation
   */
  parseUnits(uom) {
    if (!uom) return '';
    
    const unitMap = {
      'wmoUnit:m': 'm',
      'wmoUnit:s': 's',
      'wmoUnit:degree_(angle)': '°',
      'nwsUnit:s': 's',
      'nwsUnit:m': 'm',
      'nwsUnit:ft': 'ft'
    };
    
    return unitMap[uom] || uom;
  }
  
  /**
   * Format wave data into final structure
   */
  formatWaveData(data) {
    const formatted = {
      source: data.source,
      gridpoint: data.gridpoint,
      timestamp: data.timestamp
    };
    
    // Current conditions
    if (data.current.waveHeight) {
      formatted.height = data.current.waveHeight.value;
      formatted.heightUnits = data.current.waveHeight.units;
    }
    
    if (data.current.wavePeriod) {
      formatted.period = data.current.wavePeriod.value;
      formatted.periodUnits = data.current.wavePeriod.units;
    }
    
    if (data.current.waveDirection) {
      formatted.direction = data.current.waveDirection.value;
    }
    
    // Primary swell
    if (data.current.primarySwellHeight || data.current.primarySwellDirection) {
      formatted.primarySwell = {
        height: data.current.primarySwellHeight?.value,
        direction: data.current.primarySwellDirection?.value
      };
    }
    
    // Secondary swell
    if (data.current.secondarySwellHeight || data.current.secondarySwellDirection) {
      formatted.secondarySwell = {
        height: data.current.secondarySwellHeight?.value,
        direction: data.current.secondarySwellDirection?.value
      };
    }
    
    // Add forecast if available
    if (Object.keys(data.forecast).length > 0) {
      formatted.forecast = data.forecast;
    }
    
    return formatted;
  }
}

module.exports = NWSWaveClient;
