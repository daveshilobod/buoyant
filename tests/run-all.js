#!/usr/bin/env node

/**
 * Run all tests
 * Usage: npm test
 */

const { exec } = require('child_process');
const path = require('path');

console.log('🧪 Running Buoyant test suite...\n');

const tests = [
  'test-buoyant.js',
  'test-cli.js',
  'test-weather.js'
];

let currentTest = 0;
let allPassed = true;

function runNextTest() {
  if (currentTest >= tests.length) {
    // All tests complete
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log('✅ All test suites passed!');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed');
      process.exit(1);
    }
    return;
  }
  
  const testFile = tests[currentTest];
  console.log(`\nRunning ${testFile}...`);
  console.log('-'.repeat(30));
  
  exec(`node ${path.join(__dirname, testFile)}`, (error, stdout, stderr) => {
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    if (error) {
      allPassed = false;
    }
    
    currentTest++;
    runNextTest();
  });
}

// Start running tests
runNextTest();
