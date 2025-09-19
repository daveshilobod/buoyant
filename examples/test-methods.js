// Quick test of what actually works

const Buoyant = require('../index');

async function quickTest() {
  const buoyant = new Buoyant();
  
  console.log('Available methods on buoyant instance:');
  console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(buoyant))
    .filter(m => typeof buoyant[m] === 'function' && !m.startsWith('_'))
    .sort());
  
  // Test what the CLI uses successfully
  console.log('\n--- Testing getSeaStateByZip("96813") ---');
  try {
    const data = await buoyant.getSeaStateByZip('96813');
    console.log('Success! Keys:', Object.keys(data));
  } catch (err) {
    console.log('Failed:', err.message);
  }
  
  console.log('\n--- Testing getSeaState(21.3099, -157.8581) ---');
  try {
    const data = await buoyant.getSeaState(21.3099, -157.8581);
    console.log('Success! Keys:', Object.keys(data));
  } catch (err) {
    console.log('Failed:', err.message);
  }
}

quickTest().catch(console.error);
