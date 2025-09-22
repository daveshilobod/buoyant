/**
 * Tests for WeatherClient
 * Validates NWS weather data fetching
 */

const WeatherClient = require('../lib/clients/weather');

// Test helpers
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runWeatherTests() {
  console.log('Running Weather Client tests...\n');
  
  const weather = new WeatherClient({ quiet: false });
  let passed = 0;
  let failed = 0;
  
  // Test 1: Get gridpoint for valid coordinates
  try {
    const gridpoint = await weather.getGridpoint(21.3099, -157.8581); // Honolulu
    assert(gridpoint.gridId, 'Should have grid ID');
    assert(gridpoint.gridX !== undefined, 'Should have grid X');
    assert(gridpoint.gridY !== undefined, 'Should have grid Y');
    assert(gridpoint.observationStations, 'Should have observation stations URL');
    console.log('✅ Gets gridpoint for coordinates');
    passed++;
  } catch (err) {
    console.log('❌ Failed to get gridpoint:', err.message);
    failed++;
  }
  
  // Test 2: Get current weather observations
  try {
    const gridpoint = await weather.getGridpoint(21.3099, -157.8581);
    const observations = await weather.getCurrentObservations(gridpoint.observationStations);
    
    if (observations) {
      assert(observations.station, 'Should have station ID');
      assert(observations.timestamp, 'Should have timestamp');
      // Temperature might be null but field should exist
      assert('temperature' in observations, 'Should have temperature field');
      console.log(`✅ Gets current observations from station ${observations.station}`);
    } else {
      console.log('⚠️  No current observations available (stations might be down)');
    }
    passed++;
  } catch (err) {
    console.log('❌ Failed to get observations:', err.message);
    failed++;
  }
  
  // Test 3: Get 7-day forecast
  try {
    const gridpoint = await weather.getGridpoint(21.3099, -157.8581);
    const forecast = await weather.getForecast(gridpoint);
    
    assert(Array.isArray(forecast), 'Forecast should be an array');
    assert(forecast.length > 0, 'Should have forecast periods');
    assert(forecast[0].name, 'Should have period name');
    assert(forecast[0].temperature !== undefined, 'Should have temperature');
    assert(forecast[0].shortForecast, 'Should have short forecast');
    
    console.log(`✅ Gets ${forecast.length}-period forecast`);
    passed++;
  } catch (err) {
    console.log('❌ Failed to get forecast:', err.message);
    failed++;
  }
  
  // Test 4: Get hourly forecast
  try {
    const gridpoint = await weather.getGridpoint(21.3099, -157.8581);
    const hourly = await weather.getHourlyForecast(gridpoint);
    
    assert(Array.isArray(hourly), 'Hourly should be an array');
    if (hourly.length > 0) {
      assert(hourly[0].startTime, 'Should have start time');
      assert(hourly[0].temperature !== undefined, 'Should have temperature');
      console.log(`✅ Gets ${hourly.length}-hour forecast`);
    } else {
      console.log('⚠️  No hourly forecast available');
    }
    passed++;
  } catch (err) {
    console.log('❌ Failed to get hourly forecast:', err.message);
    failed++;
  }
  
  // Test 5: Get weather alerts
  try {
    const alerts = await weather.getAlerts(21.3099, -157.8581);
    assert(Array.isArray(alerts), 'Alerts should be an array');
    
    if (alerts.length > 0) {
      assert(alerts[0].headline, 'Alert should have headline');
      assert(alerts[0].severity, 'Alert should have severity');
      console.log(`✅ Gets weather alerts (${alerts.length} active)`);
    } else {
      console.log('✅ Gets weather alerts (none active)');
    }
    passed++;
  } catch (err) {
    console.log('❌ Failed to get alerts:', err.message);
    failed++;
  }
  
  // Test 6: Get all weather data at once
  try {
    const allWeather = await weather.getWeather(21.3099, -157.8581);
    
    assert(allWeather.current !== undefined, 'Should have current weather');
    assert(allWeather.forecast !== undefined, 'Should have forecast');
    assert(allWeather.hourly !== undefined, 'Should have hourly');
    assert(allWeather.gridpoint, 'Should have gridpoint info');
    
    console.log('✅ Gets complete weather data');
    passed++;
  } catch (err) {
    console.log('❌ Failed to get complete weather:', err.message);
    failed++;
  }
  
  // Test 7: Handles inland location gracefully
  try {
    const denver = await weather.getWeather(39.7392, -104.9903); // Denver
    // Should still get weather even for inland location
    assert(denver.forecast, 'Should get forecast for inland location');
    console.log('✅ Handles inland location weather');
    passed++;
  } catch (err) {
    console.log('❌ Failed on inland location:', err.message);
    failed++;
  }
  
  // Test 8: Unit conversions
  try {
    const gridpoint = await weather.getGridpoint(21.3099, -157.8581);
    const obs = await weather.getCurrentObservations(gridpoint.observationStations);
    
    if (obs && obs.temperatureC !== null) {
      // Check that F conversion is reasonable
      const expectedF = obs.temperatureC * 1.8 + 32;
      const diff = Math.abs(obs.temperature - expectedF);
      assert(diff < 1, 'Temperature conversion should be accurate');
      console.log('✅ Temperature conversion correct');
    } else {
      console.log('⚠️  No temperature data to test conversion');
    }
    passed++;
  } catch (err) {
    console.log('❌ Unit conversion test failed:', err.message);
    failed++;
  }
  
  console.log('\n=============================');
  console.log(`Weather Tests: ${passed}/${passed + failed} passed`);
  
  if (failed > 0) {
    console.log(`⚠️  ${failed} tests failed - this might be due to NWS service issues`);
  } else {
    console.log('✨ All weather tests passed!');
  }
  
  return failed === 0;
}

// Run tests if called directly
if (require.main === module) {
  runWeatherTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error('Test runner failed:', err);
      process.exit(1);
    });
}

module.exports = runWeatherTests;
