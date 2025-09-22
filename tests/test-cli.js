/**
 * Test CLI commands
 * Run with: node tests/test-cli.js
 */

const { exec } = require('child_process');
const path = require('path');
const assert = require('assert');

const CLI_PATH = path.join(__dirname, '..', 'cli.js');

// Test counter
let tests = 0;
let passed = 0;

async function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(`node ${CLI_PATH} ${command}`, (error, stdout, stderr) => {
      if (error && !command.includes('80202')) { // Inland zip expected to fail
        reject(error);
      } else {
        resolve({ stdout, stderr, error });
      }
    });
  });
}

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
  console.log('Running CLI tests...\n');
  
  // Test 1: Help command
  await test('Shows help with --help', async () => {
    const { stdout } = await runCommand('--help');
    assert(stdout.includes('buoyant'), 'Should show command name');
    assert(stdout.includes('zip'), 'Should list zip command');
    assert(stdout.includes('coords'), 'Should list coords command');
    assert(stdout.includes('buoy'), 'Should list buoy command');
  });
  
  // Test 2: Version
  await test('Shows version with --version', async () => {
    const { stdout } = await runCommand('--version');
    assert(stdout.includes('0.1.0'), 'Should show version');
  });
  
  // Test 3: Zip command with coastal zip
  await test('Gets data for coastal zip code', async () => {
    const { stdout } = await runCommand('zip 96813');
    assert(stdout.includes('📍'), 'Should show location marker');
    assert(stdout.includes('Sources:'), 'Should show data sources');
    // May or may not have waves depending on buoy availability
  });
  
  // Test 4: Zip command with inland zip
  await test('Rejects inland zip code', async () => {
    const { stdout, stderr, error } = await runCommand('zip 80202');
    const output = stdout + stderr;
    assert(output.includes('inland') || error, 'Should mention inland or error');
  });
  
  // Test 5: Coords command
  await test('Gets data for coordinates', async () => {
    const { stdout } = await runCommand('coords -- 21.3 -157.8');
    assert(stdout.includes('📍 Location:'), 'Should show location');
    assert(stdout.includes('21.3'), 'Should show latitude');
    assert(stdout.includes('-157.8') || stdout.includes('157.8'), 'Should show longitude');
  });
  
  // Test 6: Buoy command
  await test('Gets specific buoy data', async () => {
    const { stdout } = await runCommand('buoy 51211');
    assert(stdout.includes('🛟 Buoy 51211'), 'Should show buoy ID');
    assert(stdout.includes('Time:'), 'Should show timestamp');
  });
  
  // Test 7: Buoy with spectral data
  await test('Gets buoy spectral data with --spectral', async () => {
    const { stdout } = await runCommand('buoy 51211 --spectral');
    assert(stdout.includes('Spectral Data:') || stdout.includes('No spectral'), 
      'Should mention spectral data');
  });
  
  // Test 8: Find command
  await test('Finds nearby data sources', async () => {
    const { stdout } = await runCommand('find -- 21.3 -157.8');
    assert(stdout.includes('📡 Available Data Sources'), 'Should show header');
    assert(stdout.includes('Buoys:') || stdout.includes('Tide Stations:'), 
      'Should list some data sources');
  });
  
  // Test 9: JSON output
  await test('Outputs JSON with --json flag', async () => {
    const { stdout } = await runCommand('zip 96813 --json');
    const data = JSON.parse(stdout);
    assert(data.location, 'JSON should have location');
    assert(Array.isArray(data.sources), 'JSON should have sources array');
  });
  
  // Test 10: Buoy history
  await test('Gets buoy history with --history', async () => {
    const { stdout } = await runCommand('buoy 51211 --history 3');
    assert(stdout.includes('Last 3 observations'), 'Should show history count');
    // Count the date/time lines
    const timeMatches = stdout.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
    assert(timeMatches && timeMatches.length >= 2, 'Should show multiple observations');
  });
  
  // Test 11: Negative coordinates handling
  await test('Handles negative coordinates correctly', async () => {
    const { stdout } = await runCommand('coords -- 37.7 -122.4'); // San Francisco
    assert(stdout.includes('📍 Location:'), 'Should handle negative longitude');
  });
  
  // Test 12: Shows data source in output
  await test('Shows which buoy/station provided data', async () => {
    const { stdout } = await runCommand('coords -- 21.3 -157.8');
    // Should show source info if data is available
    if (stdout.includes('🌊 Waves:')) {
      assert(stdout.includes('From: Buoy') || stdout.includes('Skipped closer'), 
        'Should show data source for waves');
    }
  });
  
  // Test 13: Report command with default radius
  await test('Report command works with default radius', async () => {
    const { stdout } = await runCommand('report 96815');
    assert(stdout.includes('COMPREHENSIVE MARINE REPORT'), 'Should show report header');
    assert(stdout.includes('AVAILABLE DATA SOURCES'), 'Should list data sources');
    // Default radius should be reasonable
    if (stdout.includes('Nearby Buoys:')) {
      // Should not have excessive buoys from too large radius
      const buoyMatches = stdout.match(/\d{5}: .+ \(\d+\.\d+km\)/g) || [];
      assert(buoyMatches.length <= 5, 'Default radius should not return too many buoys');
    }
  });
  
  // Test 14: Report command with custom radius
  await test('Report command respects --radius flag', async () => {
    const smallResult = await runCommand('report 96815 --radius 10');
    const largeResult = await runCommand('report 96815 --radius 40');
    
    // Count buoys in each result
    const smallBuoys = (smallResult.stdout.match(/\d{5}: .+ \(\d+\.\d+km\)/g) || []).length;
    const largeBuoys = (largeResult.stdout.match(/\d{5}: .+ \(\d+\.\d+km\)/g) || []).length;
    
    assert(largeBuoys >= smallBuoys, 
      `Larger radius should find same or more buoys (small: ${smallBuoys}, large: ${largeBuoys})`);
  });
  
  // Test 15: Report command JSON with radius
  await test('Report JSON output includes correct search radius', async () => {
    const { stdout } = await runCommand('report 96815 --json --radius 20');
    const data = JSON.parse(stdout);
    assert(data.sources, 'JSON should have sources');
    assert(data.sources.searchRadius === 20, 'Should use specified radius');
    // All buoys should be within radius
    data.sources.buoys.forEach(buoy => {
      assert(buoy.distance <= 20, `Buoy ${buoy.id} should be within 20km`);
    });
  });
  
  // Summary
  console.log(`\n=============================`);
  console.log(`CLI Tests: ${passed}/${tests} passed`);
  if (passed === tests) {
    console.log('✨ All CLI tests passed!');
  } else {
    console.log(`❌ ${tests - passed} tests failed`);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);
