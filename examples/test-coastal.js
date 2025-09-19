const Buoyant = require('../index');

async function testLocations() {
  const buoyant = new Buoyant();
  await buoyant.init();
  
  const testCases = [
    { name: 'Hawaii (valid)', lat: 21.289, lon: -157.917, shouldWork: true },
    { name: 'San Francisco (valid)', lat: 37.7749, lon: -122.4194, shouldWork: true },
    { name: 'Miami Beach (valid)', lat: 25.7617, lon: -80.1918, shouldWork: true },
    { name: 'Denver (invalid)', lat: 39.7392, lon: -104.9903, shouldWork: false },
    { name: 'Kansas City (invalid)', lat: 39.0997, lon: -94.5786, shouldWork: false },
    { name: 'Las Vegas (invalid)', lat: 36.1699, lon: -115.1398, shouldWork: false }
  ];
  
  console.log('Testing coastal validation...\n');
  
  for (const test of testCases) {
    try {
      console.log(`Testing ${test.name} (${test.lat}, ${test.lon}):`);
      
      const result = await buoyant.getMarineConditions({
        lat: test.lat,
        lon: test.lon,
        include: ['weather'] // Just test weather since it's fastest
      });
      
      if (test.shouldWork) {
        console.log('✓ Correctly returned data\n');
      } else {
        console.log('✗ Should have been rejected but returned data!\n');
      }
    } catch (err) {
      if (!test.shouldWork) {
        console.log(`✓ Correctly rejected: "${err.message}"\n`);
      } else {
        console.log(`✗ Should have worked but failed: ${err.message}\n`);
      }
    }
  }
}

testLocations().catch(console.error);
