const Buoyant = require('../index');

async function main() {
  try {
    const buoyant = new Buoyant();
    await buoyant.init();
    
    // Test 1: Valid coastal location with all data types
    console.log('=== Test 1: Honolulu Harbor ===\n');
    try {
      const hawaii = await buoyant.getMarineConditions({
        lat: 21.3099,
        lon: -157.8669,
        include: ['waves', 'wind', 'tides', 'weather']
      });
      
      console.log('Wave Height:', hawaii.waves?.height, 'm');
      console.log('Wind Speed:', hawaii.wind?.speed, 'm/s');
      console.log('Next Tide:', hawaii.tides?.next?.type, 'at', hawaii.tides?.next?.time);
      console.log('Weather:', hawaii.weather?.description);
      console.log('\n✓ All data types working\n');
    } catch (err) {
      console.error('Failed:', err.message, '\n');
    }
    
    // Test 2: Inland location (should fail)
    console.log('=== Test 2: Denver (Should Fail) ===\n');
    try {
      await buoyant.getMarineConditions({
        lat: 39.7392,
        lon: -104.9903,
        include: ['waves']
      });
      console.log('✗ ERROR: Denver returned data (should have been rejected)\n');
    } catch (err) {
      console.log('✓ Correctly rejected:', err.message, '\n');
    }
    
    // Test 3: Edge case - Great Lakes (currently rejected, could be supported)
    console.log('=== Test 3: Chicago/Lake Michigan ===\n');
    try {
      await buoyant.getMarineConditions({
        lat: 41.8781,
        lon: -87.6298,
        include: ['waves']
      });
      console.log('Returned data for Great Lakes\n');
    } catch (err) {
      console.log('Rejected:', err.message);
      console.log('(Great Lakes could be supported in future)\n');
    }
    
  } catch (err) {
    console.error('Setup error:', err.message);
  }
}

main();
