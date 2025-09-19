/**
 * Caching Example
 * 
 * Demonstrates the production caching strategy that ran
 * every hour on Firebase Cloud Functions.
 */

const BuoyCache = require('../lib/cache/buoy-cache');
const NDBCClient = require('../lib/clients/ndbc');

async function cachingExample() {
  console.log('🚀 NDBC Caching Strategy Example');
  console.log('Based on production Firebase Cloud Function');
  console.log('=' .repeat(50) + '\n');
  
  // Initialize NDBC client and cache
  const ndbc = new NDBCClient();
  const cache = new BuoyCache({
    ttl: 3600000, // 1 hour, like production
    staggerDelay: 1000 // 1 second between requests
  });
  
  // Small list of buoys for demo
  const testBuoys = [
    { id: '51201', name: 'Waimea Bay' },
    { id: '51202', name: 'Mokapu Point' },
    { id: '51203', name: 'Kaneohe Bay' },
    { id: '46026', name: 'San Francisco' },
    { id: '44013', name: 'Boston' }
  ];
  
  console.log('📊 Initial Cache Stats:');
  let stats = await cache.getStats();
  console.log(`  Size: ${stats.size}`);
  console.log('');
  
  // Test 1: Direct fetch (no cache)
  console.log('Test 1: Direct Fetch (No Cache)');
  console.log('-'.repeat(30));
  const start1 = Date.now();
  
  try {
    const data = await ndbc.getBuoyData('51201');
    const elapsed = Date.now() - start1;
    console.log(`✓ Fetched from NDBC in ${elapsed}ms`);
    console.log(`  Wave height: ${data.waves.height}m`);
  } catch (err) {
    console.log(`✗ Failed: ${err.message}`);
  }
  
  console.log('');
  
  // Test 2: Bulk cache update (like the cron job)
  console.log('Test 2: Bulk Cache Update');
  console.log('-'.repeat(30));
  console.log('Simulating hourly cron job...\n');
  
  const results = await cache.updateAllBuoys(
    testBuoys,
    async (buoyId) => {
      try {
        return await ndbc.getBuoyData(buoyId);
      } catch (err) {
        console.log(`  ⚠ ${buoyId}: ${err.message}`);
        return null;
      }
    }
  );
  
  console.log('');
  
  // Test 3: Fetch from cache
  console.log('Test 3: Fetch from Cache');
  console.log('-'.repeat(30));
  
  for (const buoy of testBuoys.slice(0, 3)) {
    const start = Date.now();
    const cached = await cache.get(buoy.id);
    const elapsed = Date.now() - start;
    
    if (cached) {
      console.log(`✓ ${buoy.id}: Retrieved from cache in ${elapsed}ms`);
      if (cached.waves && cached.waves.height !== null) {
        console.log(`  Wave height: ${cached.waves.height}m (cached)`);
      }
    } else {
      console.log(`✗ ${buoy.id}: Not in cache`);
    }
  }
  
  console.log('');
  
  // Final cache stats
  console.log('📊 Final Cache Stats:');
  stats = await cache.getStats();
  console.log(`  Size: ${stats.size} buoys`);
  if (stats.avgAge) {
    console.log(`  Average age: ${Math.round(stats.avgAge / 1000)}s`);
    console.log(`  Newest: ${Math.round(stats.newest / 1000)}s ago`);
    console.log(`  Oldest: ${Math.round(stats.oldest / 1000)}s ago`);
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('💡 Production Strategy:');
  console.log('- Firebase Cloud Function ran every hour');
  console.log('- Staggered requests by 1 second + random 0-200ms');
  console.log('- Cached in Firestore with geohash for spatial queries');
  console.log('- Silent failure handling (never blocked other buoys)');
  console.log('- Response time: ~3 seconds → ~50ms with cache');
  console.log('=' .repeat(50));
}

cachingExample().catch(console.error);
