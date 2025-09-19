const Buoyant = require('../index');

async function main() {
  try {
    const buoyant = new Buoyant();
    await buoyant.init();
    
    console.log('Fetching conditions for Waimea Bay, Oahu...\n');
    
    const conditions = await buoyant.getMarineConditions({
      lat: 21.640,  // Closer to Waimea buoy
      lon: -158.062,
      include: ['waves', 'wind', 'weather']
    });
    
    console.log(JSON.stringify(conditions, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
