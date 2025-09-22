const Buoyant = require('../index');

async function testGridSearch() {
  const buoyant = new Buoyant();
  await buoyant.init();
  
  console.log('Testing NWS gridpoint search algorithm...\n');
  console.log('This will try to find wave data by searching in expanding rings');
  console.log('Watch as it hunts for a gridpoint that actually has marine data!\n');
  console.log('=' .repeat(60) + '\n');
  
  const testLocations = [
    { 
      name: 'Santa Cruz, CA', 
      lat: 36.9741, 
      lon: -122.0308,
      description: 'Should find NWS wave data after searching neighbors'
    },
    {
      name: 'Outer Banks, NC',
      lat: 35.5585,
      lon: -75.4665,
      description: 'Coastal area that might need grid searching'
    },
    {
      name: 'Remote Oregon Coast',
      lat: 44.6365,
      lon: -124.0535,
      description: 'Area likely far from buoys, will use NWS'
    }
  ];
  
  for (const location of testLocations) {
    console.log(`\nTesting: ${location.name}`);
    console.log(`Coordinates: ${location.lat}, ${location.lon}`);
    console.log(`Expected: ${location.description}\n`);
    
    try {
      const start = Date.now();
      const result = await buoyant.getMarineConditions({
        lat: location.lat,
        lon: location.lon,
        include: ['waves']
      });
      const elapsed = Date.now() - start;
      
      console.log(`✓ Success in ${elapsed}ms`);
      console.log(`  Source: ${result.waves.source}`);
      
      if (result.waves.source === 'NDBC') {
        console.log(`  Buoy: ${result.waves.station.name} (${result.waves.station.distance}km away)`);
        console.log(`  Wave Height: ${result.waves.height}m`);
      } else if (result.waves.source === 'NWS') {
        console.log(`  Gridpoint: ${result.waves.gridpoint}`);
        console.log(`  Wave Height: ${result.waves.height}${result.waves.heightUnits}`);
        console.log(`  (Found after searching nearby gridpoints!)`);
      }
      
    } catch (err) {
      console.log(`✗ Failed: ${err.message}`);
    }
    
    console.log('-'.repeat(60));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Grid search test complete!');
  console.log('\nThe NWS API is inconsistent - some gridpoints have wave data,');
  console.log('some don\'t. The search algorithm tries up to 21 different points');
  console.log('in an expanding ring pattern to find one that works.');
}

testGridSearch().catch(console.error);
