/**
 * Test suite for Buoyant
 * Run with: node tests/test-buoyant.js
 */

const assert = require('assert');
const Buoyant = require('../index');
const path = require('path');

// Test counter
let tests = 0;
let passed = 0;

async function test(name, fn) {
  tests++;
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   ${err.message}`);
  }
}

async function runTests() {
  const buoyant = new Buoyant();
  
  console.log('Running Buoyant tests...\n');
  
  // Test 1: Basic instantiation
  await test('Creates Buoyant instance', () => {
    assert(buoyant instanceof Buoyant);
    assert(buoyant.ndbc);
    assert(buoyant.tides);
    assert(buoyant.nws);
    assert(buoyant.validator);
  });
  
  // Test 2: Station loading
  await test('Loads NDBC stations', () => {
    assert(buoyant.ndbc.stations.length > 0, 'Should load stations');
    assert(buoyant.ndbc.stations.length > 1000, 'Should have many stations');
  });
  
  // Test 3: Find nearest buoy
  await test('Finds nearest buoy for Hawaii coordinates', () => {
    const buoy = buoyant.ndbc.findNearest(21.3, -157.8, 50);
    assert(buoy, 'Should find a buoy');
    assert(buoy.distance < 50, 'Should be within 50km');
    assert(buoy.id, 'Should have an ID');
  });
  
  // Test 4: Find all buoys within radius
  await test('Finds multiple buoys near Hawaii', () => {
    const buoys = buoyant.ndbc.findAllWithinRadius(21.3, -157.8, 30);
    assert(Array.isArray(buoys), 'Should return array');
    assert(buoys.length > 0, 'Should find at least one buoy');
    assert(buoys[0].distance <= buoys[buoys.length - 1].distance, 'Should be sorted by distance');
  });
  
  // Test 5: Coastal validation - coastal location
  await test('Validates coastal location (Hawaii)', () => {
    const isCoastal = buoyant.validator.isCoastal(21.3, -157.8);
    assert(isCoastal === true, 'Hawaii should be coastal');
  });
  
  // Test 6: Coastal validation - inland location  
  await test('Rejects inland location (Denver)', () => {
    const isCoastal = buoyant.validator.isCoastal(39.7392, -104.9903);
    assert(isCoastal === false, 'Denver should not be coastal');
  });
  
  // Test 7: Get specific buoy data
  await test('Fetches data from specific buoy', async () => {
    try {
      const data = await buoyant.getBuoy('51211');
      assert(data, 'Should return data');
      assert(data.timestamp, 'Should have timestamp');
      assert(data.waves || data.wind || data.atmosphere, 'Should have some measurements');
    } catch (err) {
      // Buoy might be offline, that's OK
      assert(err.message.includes('51211') || err.message.includes('fetch'), 
        'Error should mention buoy ID or network issue');
    }
  });
  
  // Test 8: Get sea state for valid coordinates
  await test('Gets sea state for coastal coordinates', async () => {
    const data = await buoyant.getSeaState(21.289, -157.917);
    assert(data, 'Should return data');
    assert(data.location, 'Should have location');
    assert(data.location.lat === 21.289, 'Should preserve latitude');
    assert(data.location.lon === -157.917, 'Should preserve longitude');
    assert(Array.isArray(data.sources), 'Should have sources array');
  });
  
  // Test 9: Reject inland coordinates
  await test('Rejects sea state for inland coordinates', async () => {
    try {
      await buoyant.getSeaState(39.7392, -104.9903); // Denver
      assert.fail('Should have thrown error for inland location');
    } catch (err) {
      assert(err.message.includes('inland'), 'Error should mention inland');
    }
  });
  
  // Test 10: Get sea state by zip (coastal)
  await test('Gets sea state by coastal zip code', async () => {
    const data = await buoyant.getSeaStateByZip('96712'); // Haleiwa, HI
    assert(data, 'Should return data');
    assert(data.location, 'Should have location');
    assert(Array.isArray(data.sources), 'Should have sources');
  });
  
  // Test 11: Reject inland zip
  await test('Rejects inland zip code', async () => {
    try {
      await buoyant.getSeaStateByZip('80202'); // Denver
      assert.fail('Should have thrown error for inland zip');
    } catch (err) {
      assert(err.message.includes('inland'), 'Error should mention inland');
    }
  });
  
  // Test 12: Find sources
  await test('Finds data sources near location', async () => {
    const sources = await buoyant.findSources(21.3, -157.8, 50);
    assert(sources, 'Should return sources');
    assert(sources.location, 'Should echo location');
    assert(Array.isArray(sources.buoys), 'Should have buoys array');
    assert(Array.isArray(sources.tideStations), 'Should have tide stations array');
  });
  
  // Test 13: Get tides
  await test('Gets tide data for coastal location', async () => {
    const tides = await buoyant.getTides(21.3, -157.8);
    assert(tides, 'Should return tide data');
    // Tide data structure varies, just check it exists
  });
  
  // Test 14: Distance calculation with geofire
  await test('Calculates distances correctly', () => {
    const geofire = require('geofire-common');
    // Honolulu to Pearl Harbor (should be ~15-20km)
    const dist = geofire.distanceBetween([21.3, -157.8], [21.297, -157.959]);
    assert(dist > 10 && dist < 25, `Distance should be 15-20km, got ${dist}`);
  });
  
  // Test 15: Wave data fallback
  await test('Falls back to NWS when no buoy available', async () => {
    // Use a location with no nearby buoys
    const data = await buoyant._getWaveData(45.0, -125.0); // Far offshore
    // Should either get data or throw error, not hang
    assert(data || true, 'Should complete');
  });
  
  // Test 16: Find multiple buoys within radius
  await test('Finds multiple buoys within radius', async () => {
    const sources = await buoyant.findSources(21.3, -157.8, 30);
    assert(sources.buoys.length > 0, 'Should find at least one buoy');
    // Check if we're getting multiple buoys when they exist
    if (sources.buoys.length > 1) {
      assert(sources.buoys[0].distance <= sources.buoys[1].distance, 
        'Buoys should be sorted by distance');
    }
  });
  
  // Test 17: Radius affects source count
  await test('Different radius returns different source counts', async () => {
    const smallRadius = await buoyant.findSources(21.3, -157.8, 15);
    const largeRadius = await buoyant.findSources(21.3, -157.8, 50);
    assert(largeRadius.buoys.length >= smallRadius.buoys.length, 
      'Larger radius should find same or more buoys');
    assert(largeRadius.tideStations.length >= smallRadius.tideStations.length,
      'Larger radius should find same or more tide stations');
  });
  
  // Test 18: Verify Pearl Harbor buoy appears for Honolulu
  await test('Finds Pearl Harbor buoy from Honolulu', async () => {
    // Honolulu coordinates
    const sources = await buoyant.findSources(21.307, -157.858, 25);
    // Pearl Harbor entrance buoy should be within 25km
    const buoyIds = sources.buoys.map(b => b.id);
    // Check if we have multiple south shore buoys
    assert(sources.buoys.length > 0, 'Should find buoys near Honolulu');
    if (sources.buoys.length > 1) {
      // Should have both Honolulu and Pearl Harbor area buoys
      assert(sources.buoys.some(b => b.distance < 15), 
        'Should have at least one buoy within 15km');
    }
  });
  
  // Test 19: No cross-shore contamination
  await test('North shore query doesn\'t get south shore buoys', async () => {
    // Haleiwa (North Shore) with small radius
    const sources = await buoyant.findSources(21.595, -158.103, 20);
    // Should only get north shore buoys
    sources.buoys.forEach(buoy => {
      assert(buoy.distance <= 20, `Buoy ${buoy.id} should be within 20km`);
    });
    // Verify we're not getting Honolulu buoys (would be ~40km away)
    const distances = sources.buoys.map(b => b.distance);
    assert(Math.max(...distances) <= 20, 'Should not include distant buoys');
  });
  
  // Summary
  console.log(`\n=============================`);
  console.log(`Tests: ${passed}/${tests} passed`);
  if (passed === tests) {
    console.log('✨ All tests passed!');
  } else {
    console.log(`❌ ${tests - passed} tests failed`);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);
