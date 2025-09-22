/**
 * NDBC Data Cache
 * 
 * Inspired by the production Firebase caching strategy.
 * Instead of hammering NDBC on every request, we can cache
 * buoy data locally or in Redis/Firestore/wherever.
 * 
 * This is how you avoid getting rate-limited and improve
 * response times from seconds to milliseconds.
 */

class BuoyCache {
  constructor(options = {}) {
    this.store = options.store || new Map(); // Use Map for in-memory, or pass Redis/etc
    this.ttl = options.ttl || 3600000; // 1 hour default, matching production
    this.staggerDelay = options.staggerDelay || 1000; // 1 second between updates
    this.updateRunning = false;
    this.lastUpdateTime = null;
    
    // If store has async methods, detect it
    this.isAsync = this.store.get && this.store.get.constructor.name === 'AsyncFunction';
  }
  
  /**
   * Get cached buoy data
   */
  async get(buoyId) {
    try {
      const cached = this.isAsync ? 
        await this.store.get(buoyId) : 
        this.store.get(buoyId);
      
      if (!cached) return null;
      
      // Parse if stored as string (Redis)
      const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
      
      // Check if expired
      if (Date.now() - data.timestamp > this.ttl) {
        return null;
      }
      
      return data;
    } catch (err) {
      console.error('Cache get error:', err);
      return null;
    }
  }
  
  /**
   * Set cached buoy data
   */
  async set(buoyId, data) {
    try {
      const cacheData = {
        ...data,
        timestamp: Date.now(),
        cached: true
      };
      
      const value = typeof this.store.set === 'function' && this.store.set.length > 2 ?
        JSON.stringify(cacheData) : // Redis-like stores need strings
        cacheData;
      
      if (this.isAsync) {
        await this.store.set(buoyId, value);
      } else {
        this.store.set(buoyId, value);
      }
      
      return true;
    } catch (err) {
      console.error('Cache set error:', err);
      return false;
    }
  }
  
  /**
   * Update all buoys in cache (like the Firebase cron job)
   * This is what ran every hour in production
   */
  async updateAllBuoys(buoyList, fetchFunction) {
    if (this.updateRunning) {
      console.log('Update already in progress, skipping...');
      return;
    }
    
    this.updateRunning = true;
    const startTime = Date.now();
    const results = {
      success: 0,
      failed: 0,
      skipped: 0
    };
    
    console.log(`Starting cache update for ${buoyList.length} buoys...`);
    
    for (let i = 0; i < buoyList.length; i++) {
      const buoy = buoyList[i];
      
      // Check if we need to update this buoy
      const cached = await this.get(buoy.id);
      if (cached && (Date.now() - cached.timestamp) < (this.ttl * 0.9)) {
        results.skipped++;
        continue;
      }
      
      // Stagger requests like production did
      if (i > 0) {
        const delay = this.staggerDelay + (Math.random() * 200);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      try {
        console.log(`Updating buoy ${buoy.id} (${i + 1}/${buoyList.length})...`);
        const data = await fetchFunction(buoy.id);
        
        if (data) {
          await this.set(buoy.id, data);
          results.success++;
        } else {
          results.failed++;
        }
      } catch (err) {
        console.error(`Failed to update buoy ${buoy.id}:`, err.message);
        results.failed++;
        // Don't throw - continue with other buoys like production
      }
    }
    
    this.updateRunning = false;
    this.lastUpdateTime = Date.now();
    
    const elapsed = Date.now() - startTime;
    console.log(`Cache update complete in ${elapsed}ms`);
    console.log(`Success: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
    
    return results;
  }
  
  /**
   * Set up automatic updates (like the Firebase cron)
   */
  startAutoUpdate(buoyList, fetchFunction, intervalMs = 3600000) {
    console.log(`Starting auto-update every ${intervalMs / 1000 / 60} minutes`);
    
    // Do initial update
    this.updateAllBuoys(buoyList, fetchFunction);
    
    // Schedule regular updates
    this.updateInterval = setInterval(() => {
      this.updateAllBuoys(buoyList, fetchFunction);
    }, intervalMs);
    
    return () => this.stopAutoUpdate();
  }
  
  /**
   * Stop automatic updates
   */
  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('Auto-update stopped');
    }
  }
  
  /**
   * Get cache statistics
   */
  async getStats() {
    const stats = {
      size: 0,
      oldest: null,
      newest: null,
      avgAge: 0
    };
    
    if (this.store.size) {
      stats.size = this.store.size;
    }
    
    // For Map-based stores, calculate stats
    if (this.store instanceof Map) {
      const ages = [];
      const now = Date.now();
      
      for (const [key, value] of this.store) {
        const age = now - value.timestamp;
        ages.push(age);
        
        if (!stats.oldest || age > stats.oldest) {
          stats.oldest = age;
        }
        if (!stats.newest || age < stats.newest) {
          stats.newest = age;
        }
      }
      
      if (ages.length > 0) {
        stats.avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
      }
    }
    
    return stats;
  }
}

module.exports = BuoyCache;
