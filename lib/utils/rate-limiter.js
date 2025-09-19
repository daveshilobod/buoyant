/**
 * Rate Limiter for API Calls
 * 
 * NOAA doesn't officially publish rate limits, but they will
 * block you if you hammer them. This implements polite rate
 * limiting with exponential backoff.
 * 
 * Based on production experience of what NOAA tolerates.
 */

class RateLimiter {
  constructor(options = {}) {
    this.limits = {
      NDBC: {
        maxPerSecond: 2,
        maxPerMinute: 30,
        maxPerHour: 500
      },
      NWS: {
        maxPerSecond: 5,
        maxPerMinute: 60,
        maxPerHour: 1000
      },
      COOPS: {
        maxPerSecond: 2,
        maxPerMinute: 30,
        maxPerHour: 500
      }
    };
    
    // Override defaults if provided
    if (options.limits) {
      Object.assign(this.limits, options.limits);
    }
    
    // Track request counts
    this.requests = {
      NDBC: { timestamps: [] },
      NWS: { timestamps: [] },
      COOPS: { timestamps: [] }
    };
    
    // Track consecutive failures for backoff
    this.failures = {
      NDBC: 0,
      NWS: 0,
      COOPS: 0
    };
  }
  
  /**
   * Check if we can make a request to a service
   */
  async canRequest(service) {
    if (!this.limits[service]) {
      throw new Error(`Unknown service: ${service}`);
    }
    
    const now = Date.now();
    const limits = this.limits[service];
    const recent = this.requests[service].timestamps;
    
    // Clean old timestamps
    this.requests[service].timestamps = recent.filter(
      ts => now - ts < 3600000 // Keep last hour
    );
    
    // Check per-second limit
    const lastSecond = recent.filter(ts => now - ts < 1000);
    if (lastSecond.length >= limits.maxPerSecond) {
      return false;
    }
    
    // Check per-minute limit
    const lastMinute = recent.filter(ts => now - ts < 60000);
    if (lastMinute.length >= limits.maxPerMinute) {
      return false;
    }
    
    // Check per-hour limit
    const lastHour = recent.filter(ts => now - ts < 3600000);
    if (lastHour.length >= limits.maxPerHour) {
      return false;
    }
    
    // Check if we're in backoff
    if (this.failures[service] > 0) {
      const backoffMs = Math.min(
        Math.pow(2, this.failures[service]) * 1000,
        60000 // Max 1 minute backoff
      );
      
      const lastFailure = this.getLastFailure(service);
      if (now - lastFailure < backoffMs) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Wait until we can make a request
   */
  async waitForSlot(service) {
    while (!(await this.canRequest(service))) {
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  /**
   * Record a request
   */
  recordRequest(service) {
    if (!this.requests[service]) {
      throw new Error(`Unknown service: ${service}`);
    }
    
    this.requests[service].timestamps.push(Date.now());
    
    // Reset failure count on successful request
    this.failures[service] = 0;
  }
  
  /**
   * Record a failure (triggers backoff)
   */
  recordFailure(service) {
    if (!this.failures.hasOwnProperty(service)) {
      throw new Error(`Unknown service: ${service}`);
    }
    
    this.failures[service]++;
    this.requests[service].lastFailure = Date.now();
    
    console.warn(
      `${service} request failed. Failure count: ${this.failures[service]}. ` +
      `Backing off for ${Math.pow(2, this.failures[service])} seconds`
    );
  }
  
  /**
   * Get time of last failure
   */
  getLastFailure(service) {
    return this.requests[service].lastFailure || 0;
  }
  
  /**
   * Reset failure count for a service
   */
  resetFailures(service) {
    if (this.failures.hasOwnProperty(service)) {
      this.failures[service] = 0;
    }
  }
  
  /**
   * Get current stats
   */
  getStats() {
    const stats = {};
    
    for (const service of Object.keys(this.limits)) {
      const now = Date.now();
      const recent = this.requests[service].timestamps;
      
      stats[service] = {
        lastSecond: recent.filter(ts => now - ts < 1000).length,
        lastMinute: recent.filter(ts => now - ts < 60000).length,
        lastHour: recent.filter(ts => now - ts < 3600000).length,
        failures: this.failures[service],
        inBackoff: this.failures[service] > 0 && 
                   (now - this.getLastFailure(service)) < 
                   Math.pow(2, this.failures[service]) * 1000
      };
    }
    
    return stats;
  }
  
  /**
   * Stagger requests to avoid bursts
   * Useful when fetching data for multiple buoys
   */
  async staggerRequests(requests, service, delayMs = 500) {
    const results = [];
    
    for (const request of requests) {
      await this.waitForSlot(service);
      
      try {
        const result = await request();
        this.recordRequest(service);
        results.push({ success: true, data: result });
      } catch (error) {
        this.recordFailure(service);
        results.push({ success: false, error });
      }
      
      // Add delay between requests
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return results;
  }
}

module.exports = RateLimiter;
