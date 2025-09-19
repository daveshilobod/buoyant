#!/usr/bin/env node

const { Command } = require('commander');
const Buoyant = require('./index');

const program = new Command();

// Check if --json flag is present before creating Buoyant instance
const isJsonMode = process.argv.includes('--json') || process.argv.includes('-j');
const buoyant = new Buoyant({ quiet: isJsonMode });

program
  .name('buoyant')
  .description('NOAA marine data from the command line')
  .version('0.1.0')
  .addHelpText('after', `
Examples:
  $ buoyant zip 96813              # Get conditions by zip
  $ buoyant coords 21.3 -157.8     # Get conditions by coordinates  
  $ buoyant find 21.3 -157.8       # Find nearby data sources
  $ buoyant buoy 51211 --spectral  # Get buoy data with wave spectra
  $ buoyant buoy 51211 --history 5 # Get last 5 observations

Note: Use -- before negative coordinates to prevent parsing issues:
  $ buoyant coords -- 21.3 -157.8
  $ buoyant find -- 21.3 -157.8`);

program
  .command('zip <zipcode>')
  .description('Get current conditions by zip code')
  .option('-j, --json', 'Output raw JSON')
  .action(async (zipcode, options) => {
    try {
      const data = await buoyant.getSeaStateByZip(zipcode);
      
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`\n📍 ${data.location.name || zipcode}`);
        console.log('─'.repeat(40));
        
        if (data.waves) {
          if (data.waves.height !== null && data.waves.height !== undefined) {
            console.log(`🌊 Waves: ${data.waves.height}m @ ${data.waves.period}s`);
            if (data.waves.direction) console.log(`   Direction: ${data.waves.direction}°`);
            if (data.waves.stationId) {
              console.log(`   From: Buoy ${data.waves.stationId} (${data.waves.distance.toFixed(1)}km away)`);
            }
          }
          if (data.waves.waterTemp) console.log(`   Water: ${data.waves.waterTemp}°C`);
        }
        
        if (data.wind) {
          if (data.wind.speed !== null) {
            console.log(`💨 Wind: ${data.wind.speed} m/s`);
            if (data.wind.direction) console.log(`   Direction: ${data.wind.direction}°`);
            if (data.wind.station) {
              console.log(`   From: ${data.wind.station}`);
            }
          } else if (data.wind.description) {
            console.log(`💨 Wind: ${data.wind.description} ${data.wind.direction || ''}`);
          }
        }
        
        if (data.tides?.current) {
          console.log(`🌊 Tide: ${data.tides.current.height} ${data.tides.current.units}`);
        }
        if (data.tides?.predictions?.[0]) {
          const next = data.tides.predictions[0];
          console.log(`   Next ${next.type}: ${next.time}`);
        }
        
        console.log(`\nSources: ${data.sources.join(', ')}`);
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('buoy <id>')
  .description('Get data from a specific NDBC buoy')
  .option('-h, --history <count>', 'Show last N observations', '1')
  .option('-s, --spectral', 'Include spectral wave data')
  .action(async (id, options) => {
    try {
      if (options.history > 1) {
        const history = await buoyant.ndbc.getBuoyHistory(id, parseInt(options.history));
        console.log(`\n📊 Last ${options.history} observations from buoy ${id}:`);
        console.log('─'.repeat(40));
        
        history.forEach(obs => {
          const time = new Date(obs.timestamp).toLocaleString();
          console.log(`\n${time}`);
          if (obs.waves.height) console.log(`  Waves: ${obs.waves.height}m @ ${obs.waves.period}s`);
          if (obs.wind.speed) console.log(`  Wind: ${obs.wind.speed} m/s @ ${obs.wind.direction}°`);
          if (obs.atmosphere.waterTemp) console.log(`  Water: ${obs.atmosphere.waterTemp}°C`);
        });
      } else {
        const data = await buoyant.getBuoy(id);
        console.log(`\n🛟 Buoy ${id}`);
        console.log('─'.repeat(40));
        console.log(`Time: ${new Date(data.timestamp).toLocaleString()}`);
        
        if (data.waves.height) {
          console.log(`Waves: ${data.waves.height}m @ ${data.waves.period}s`);
          if (data.waves.direction) console.log(`  Direction: ${data.waves.direction}°`);
        }
        
        if (data.wind.speed) {
          console.log(`Wind: ${data.wind.speed} m/s @ ${data.wind.direction}°`);
        }
        
        if (data.atmosphere.waterTemp) {
          console.log(`Water: ${data.atmosphere.waterTemp}°C`);
        }
      }
      
      if (options.spectral) {
        try {
          const spec = await buoyant.ndbc.getBuoySpectralData(id);
          console.log('\nSpectral Data:');
          if (spec.swell.height) {
            console.log(`  Swell: ${spec.swell.height}m @ ${spec.swell.period}s`);
          }
          if (spec.windWaves.height) {
            console.log(`  Wind waves: ${spec.windWaves.height}m @ ${spec.windWaves.period}s`);
          }
          if (spec.steepness) {
            console.log(`  Steepness: ${spec.steepness}`);
          }
        } catch (err) {
          console.log('  No spectral data available');
        }
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('coords <lat> <lon>')
  .description('Get conditions for coordinates')
  .action(async (lat, lon) => {
    // Handle negative numbers passed as strings with dashes
    if (typeof lon === 'undefined' && lat.includes(',')) {
      // Handle comma-separated coords
      [lat, lon] = lat.split(',').map(s => s.trim());
    }
    try {
      const data = await buoyant.getSeaState(parseFloat(lat), parseFloat(lon));
      
      console.log(`\n📍 Location: ${lat}, ${lon}`);
      console.log('─'.repeat(40));
      
      if (data.waves?.height) {
        console.log(`🌊 Waves: ${data.waves.height}m @ ${data.waves.period}s`);
        if (data.waves.stationId) {
          console.log(`   From: Buoy ${data.waves.stationId} (${data.waves.distance.toFixed(1)}km away)`);
        }
        if (data.waves.skippedCloser?.length > 0) {
          const skipped = data.waves.skippedCloser.slice(0, 2); // Show max 2
          console.log(`   Skipped closer: ${skipped.map(b => `${b.id} (${b.distance.toFixed(1)}km - ${b.reason})`).join(', ')}`);
          if (skipped.some(b => b.reason === 'no wave data')) {
            const noWaveId = skipped.find(b => b.reason === 'no wave data').id;
            console.log(`   Try: 'buoyant buoy ${noWaveId}' or 'node cli.js buoy ${noWaveId}'`);
          }
        }
        if (data.waves.nearbyAlternatives?.length > 0) {
          const alternatives = data.waves.nearbyAlternatives.slice(0, 3); // Show max 3
          console.log(`   Also farther: ${alternatives.map(b => `${b.id} (${b.distance.toFixed(1)}km)`).join(', ')}`);
          console.log(`   Try: 'buoyant buoy ${alternatives[0].id}' or 'node cli.js buoy ${alternatives[0].id}'`);
        }
      }
      
      if (data.wind?.speed !== null && data.wind?.speed !== undefined) {
        console.log(`💨 Wind: ${data.wind.speed} m/s`);
        if (data.wind.station) {
          const distanceInfo = data.wind.distance ? ` (${data.wind.distance.toFixed(1)}km away)` : '';
          console.log(`   From: ${data.wind.station}${distanceInfo}`);
        }
      }
      
      if (data.tides?.current) {
        console.log(`🌊 Tide: ${data.tides.current.height} ${data.tides.current.units}`);
      }
      
      console.log(`\nSources: ${data.sources.join(', ')}`);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('find <lat> <lon>')
  .description('Find nearby data sources')
  .option('-r, --radius <km>', 'Search radius', '100')
  .action(async (lat, lon, options) => {
    // Handle negative numbers
    if (typeof lon === 'undefined' && lat.includes(',')) {
      [lat, lon] = lat.split(',').map(s => s.trim());
    }
    try {
      const sources = await buoyant.findSources(
        parseFloat(lat), 
        parseFloat(lon), 
        parseFloat(options.radius)
      );
      
      console.log('\n📡 Available Data Sources');
      console.log('─'.repeat(40));
      
      if (sources.buoys.length > 0) {
        console.log('\nBuoys:');
        sources.buoys.forEach(b => {
          console.log(`  ${b.id}: ${b.name} (${Math.round(b.distance)}km)`);
        });
      }
      
      if (sources.tideStations.length > 0) {
        console.log('\nTide Stations:');
        sources.tideStations.forEach(t => {
          console.log(`  ${t.id} (${Math.round(t.distance)}km)`);
        });
      }
      
      if (sources.weatherGrid) {
        console.log('\nWeather Grid:');
        console.log(`  ${sources.weatherGrid.gridId} (${sources.weatherGrid.gridX},${sources.weatherGrid.gridY})`);
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('report <zipOrCoords>')
  .description('Get comprehensive marine report with all available data')
  .option('-j, --json', 'Output raw JSON')
  .option('-r, --radius <km>', 'Search radius for data sources in km', '25')
  .action(async (location, options) => {
    try {
      let lat, lon, locationName;
      
      // Parse input - could be zip or "lat,lon"
      if (/^\d{5}$/.test(location)) {
        // It's a zip code
        const data = await buoyant.getSeaStateByZip(location);
        lat = data.location.lat;
        lon = data.location.lon;
        locationName = data.location.name || `Zip ${location}`;
      } else if (location.includes(',')) {
        // It's coordinates
        [lat, lon] = location.split(',').map(s => parseFloat(s.trim()));
        locationName = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
      } else {
        console.error('Use zip code (96815) or coordinates (21.3,-157.8)');
        process.exit(1);
      }
      
      const searchRadius = parseFloat(options.radius);
      
      if (options.json) {
        // Get ALL the data
        const fullReport = {
          location: { lat, lon, name: locationName },
          timestamp: new Date().toISOString(),
          seaState: await buoyant.getSeaState(lat, lon),
          sources: await buoyant.findSources(lat, lon, searchRadius),
          tides: await buoyant.getTides(lat, lon),
          weather: await buoyant.weather.getWeather(lat, lon),
        };
        
        // Try to get spectral data from nearest buoy
        if (fullReport.sources.buoys.length > 0) {
          try {
            fullReport.spectral = await buoyant.ndbc.getBuoySpectralData(fullReport.sources.buoys[0].id);
          } catch (err) {
            fullReport.spectral = { error: err.message };
          }
        }
        
        console.log(JSON.stringify(fullReport, null, 2));
      } else {
        // Pretty print comprehensive report
        console.log(`\n🌊 COMPREHENSIVE MARINE REPORT`);
        console.log(`📍 ${locationName}`);
        console.log(`🕰️ ${new Date().toLocaleString()}`);
        console.log('═'.repeat(50));
        
        // Get all data
        const seaState = await buoyant.getSeaState(lat, lon);
        const sources = await buoyant.findSources(lat, lon, searchRadius);
        const tides = await buoyant.getTides(lat, lon);
        const weather = await buoyant.weather.getWeather(lat, lon);
        
        // WAVE CONDITIONS
        console.log('\n🌊 WAVES');
        console.log('─'.repeat(30));
        if (seaState.waves) {
          if (seaState.waves.height !== null) {
            console.log(`Height: ${seaState.waves.height}m (${(seaState.waves.height * 3.28084).toFixed(1)}ft)`);
            console.log(`Dominant Period: ${seaState.waves.period}s`);
            if (seaState.waves.averagePeriod) {
              console.log(`Average Period: ${seaState.waves.averagePeriod}s`);
            }
            console.log(`Direction: ${seaState.waves.direction}°`);
            if (seaState.waves.stationId) {
              console.log(`Source: Buoy ${seaState.waves.stationId} (${seaState.waves.distance.toFixed(1)}km away)`);
            }
          } else {
            console.log('No wave data available');
          }
        }
        
        // Try spectral data from closest buoy
        if (sources.buoys.length > 0) {
          try {
            const spectral = await buoyant.ndbc.getBuoySpectralData(sources.buoys[0].id);
            if (spectral) {
              console.log('\nSpectral Analysis:');
              if (spectral.swell?.height) {
                console.log(`  Primary Swell: ${spectral.swell.height}m @ ${spectral.swell.period}s from ${spectral.swell.direction}°`);
              }
              if (spectral.windWaves?.height) {
                console.log(`  Wind Waves: ${spectral.windWaves.height}m @ ${spectral.windWaves.period}s`);
              }
              if (spectral.steepness) {
                console.log(`  Steepness: ${spectral.steepness}`);
              }
              if (spectral.averagePeriod) {
                console.log(`  Average Period: ${spectral.averagePeriod}s`);
              }
            }
          } catch (err) {
            // No spectral data available
          }
        }
        
        // WIND CONDITIONS
        console.log('\n💨 WIND');
        console.log('─'.repeat(30));
        if (seaState.wind?.speed !== null) {
          console.log(`Speed: ${seaState.wind.speed} m/s`);
          console.log(`Direction: ${seaState.wind.direction}°`);
          if (seaState.wind.gusts) {
            console.log(`Gusts: ${seaState.wind.gusts} m/s`);
          }
          if (seaState.wind.station) {
            const dist = seaState.wind.distance ? ` (${seaState.wind.distance.toFixed(1)}km away)` : '';
            console.log(`Source: ${seaState.wind.station}${dist}`);
          }
        } else {
          console.log('No wind data available');
        }
        
        // TIDES
        console.log('\n🌊 TIDES');
        console.log('─'.repeat(30));
        if (tides?.current) {
          console.log(`Current Level: ${tides.current.height} ${tides.current.units}`);
          if (tides.current.time) {
            console.log(`As of: ${new Date(tides.current.time).toLocaleTimeString()}`);
          }
        }
        if (tides?.predictions?.length > 0) {
          console.log('\nNext 4 Tide Changes:');
          tides.predictions.slice(0, 4).forEach(p => {
            const time = new Date(p.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            console.log(`  ${p.type === 'high' ? '🔺' : '🔻'} ${p.type}: ${time} (${p.height} ${p.units || 'm'})`);
          });
        }
        if (tides?.station) {
          console.log(`Station: ${tides.station.name || tides.station.id} (${tides.station.distance.toFixed(1)}km away)`);
        }
        
        // WATER TEMP
        if (seaState.waves?.waterTemp) {
          console.log('\n🌡️ WATER TEMPERATURE');
          console.log('─'.repeat(30));
          console.log(`${seaState.waves.waterTemp}°C`);
        }
        
        // WEATHER CONDITIONS
        console.log('\n☁️ WEATHER');
        console.log('─'.repeat(30));
        if (weather?.current) {
          const cur = weather.current;
          if (cur.temperature !== null) {
            console.log(`Temperature: ${cur.temperature}°F (${cur.temperatureC}°C)`);
          }
          if (cur.description) {
            console.log(`Conditions: ${cur.description}`);
          }
          if (cur.relativeHumidity !== null) {
            console.log(`Humidity: ${cur.relativeHumidity}%`);
          }
          if (cur.visibility !== null) {
            console.log(`Visibility: ${cur.visibility} miles`);
          }
          if (cur.barometricPressure !== null) {
            console.log(`Pressure: ${(cur.barometricPressure / 100).toFixed(1)} mb`);
          }
        }
        
        // 7-DAY FORECAST
        if (weather?.forecast && weather.forecast.length > 0) {
          console.log('\nForecast:');
          // Show next 3 periods (today, tonight, tomorrow)
          weather.forecast.slice(0, 3).forEach(period => {
            console.log(`  ${period.name}: ${period.temperature}°${period.temperatureUnit} - ${period.shortForecast}`);
          });
        }
        
        // WEATHER ALERTS
        if (weather?.alerts && weather.alerts.length > 0) {
          console.log('\n⚠️  ACTIVE ALERTS:');
          weather.alerts.forEach(alert => {
            console.log(`  ${alert.severity}: ${alert.headline}`);
          });
        }
        
        // DATA SOURCES
        console.log('\n📡 AVAILABLE DATA SOURCES');
        console.log('─'.repeat(30));
        if (sources.buoys.length > 0) {
          console.log('\nNearby Buoys:');
          sources.buoys.slice(0, 5).forEach(b => {
            console.log(`  ${b.id}: ${b.name || 'Unknown'} (${b.distance.toFixed(1)}km)`);
          });
        }
        if (sources.tideStations.length > 0) {
          console.log('\nTide Stations:');
          sources.tideStations.slice(0, 3).forEach(t => {
            console.log(`  ${t.id}: ${t.name || 'Unknown'} (${t.distance.toFixed(1)}km)`);
          });
        }
        
        console.log('\n' + '═'.repeat(50));
        console.log('Try specific buoy: buoyant buoy <id> --spectral');
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program.parse();
