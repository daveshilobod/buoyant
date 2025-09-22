# Buoyant

Get marine conditions from NOAA via their various free APIs in one convoluted and far too complicated package.

## Why?

This is a slightly cleaned up version of the backend of my rideai project to provide AI generated surf reports circa 2022-23. I rolled my own version of a sea state data API using NOAA resources -- so it'll only work in the US. 

Caveat: These are *most* of the juicy bits. I didn't put a whole lot of effort into ensuring that I extracted every tiny bit of "cool" (I use that word loosely -- the entire ordeal of developing rideai was a farcical exercise in what not to do when you don't know JavaScript).

So, along with my getting banned from r/surfing for promoting it, maybe by publishing this stuff in a public repo, someone out there will find some use for something in here and two good things will come of the project.

## Quick Start

```bash
# Clone and install
git clone https://github.com/daveshilobod/buoyant.git
cd buoyant
npm install

# Option 1: Run directly with node
node cli.js zip 96813                # Honolulu
node cli.js coords -- 21.3 -157.8    # By coordinates
node cli.js buoy 51211               # Specific buoy

# Option 2: Install as global command (like pip install -e .)
chmod +x cli.js  # One time only
npm link

# Now use from anywhere
buoyant report 96813
buoyant coords -- 21.3 -157.8
buoyant buoy 51211

# Option 3: Use the simple wrapper (no npm link needed)
chmod +x buoyant  # One time only
./buoyant report 96813
```

That's it, just clone and run.

## What You Get

- **Wave conditions** from NDBC buoys (height, period, direction)
- **Wind data** (speed, direction, gusts)
- **Tide levels** from CO-OPS stations
- **Water temperature** from buoys


## Library Usage

If you want to use it in your own code:

```javascript
const Buoyant = require('./buoyant/index');  // Adjust path as needed
const buoyant = new Buoyant();

// Get conditions by coordinates
const conditions = await buoyant.getSeaState(21.289, -157.917);

// Or use a coastal zip code
const data = await buoyant.getSeaStateByZip('96712');

// Get specific buoy data
const buoy = await buoyant.getBuoy('51201');
```

## Coverage

- US mainland coastal waters (Atlantic, Pacific, Gulf of Mexico)
- Great Lakes
- Hawaii, Alaska, Puerto Rico, USVI, Guam
- Requires location to be within ~10 miles of coast

## API Reference

### `getSeaStateByZip(zipCode)`
Get marine conditions for a US zip code. Only works for coastal areas.

### `getSeaState(lat, lon)`
Get all available marine data for coordinates.
And yes, `lon`. Not `lng`. Because `lng` is objectively wrong.

### `getBuoy(buoyId)`
Get current observations from a specific NDBC buoy.

### `findSources(lat, lon, radiusKm)`
Find available data sources near a location.

### `getTides(lat, lon)`
Get tide predictions and current water level.

### `getWeather(lat, lon)`
Get NWS weather forecast for coordinates.

## Data Sources

- **NDBC Buoys**: Wave height/period/direction, wind, water temp (30-60 min updates)
- **CO-OPS Stations**: Tide levels and predictions (6 min updates)
- **NWS Gridpoints**: Wave forecasts when buoy data unavailable
- Data can be 1-2 hours delayed

## Examples

```javascript
// Get marine data by zip code
const data = await buoyant.getSeaStateByZip('90266'); // Manhattan Beach, CA
// Returns: {
//   location: { lat: 33.88, lon: -118.41 },
//   waves: { height: 1.5, period: 8, direction: 270 },
//   wind: { speed: 12, direction: 90, gusts: 15 },
//   tides: { current: { height: 1.2, units: 'ft' }},
//   sources: ['NDBC', 'CO-OPS']
// }

// Access the data
if (data.waves?.height) {
  console.log(`Wave height: ${data.waves.height}m`);
}

// Not all fields are always available
const conditions = await buoyant.getSeaState(47.6, -122.3);
if (!conditions.waves) {
  console.log('No wave data available for this location');
}

// Inland locations throw an error
try {
  await buoyant.getSeaStateByZip('80202'); // Denver
} catch (err) {
  console.log(err.message); // "Zip code 80202 appears to be an inland location"
}
```

## Technical Notes

This library includes several approaches developed for rideai to handle NOAA's data quirks:

### About the Large Data Files

Yes, this repo includes ~40MB of JSON files. No, they're not bloat. Here's why:

**nwsStations.json (37MB)**: Contains every NOAA weather station with coordinates. NOAA doesn't provide a proper API endpoint for "find stations near location", so I needed this for spatial lookups. Loading this once on startup is still faster than making multiple API calls.

**Coastal boundary files (1-2MB)**: These geojson files enable instant coastal validation without API calls. See below on Coastal Boundary Validation

**NDBC/Tide station lists**: Pre-computed station locations with metadata. Again, NOAA doesn't provide a "find nearest" API, so I built my own spatial index.

### Coastal Boundary Validation
The coastal boundary polygon (`thickUSOutline.geojson`) was created by:
1. Taking a high-resolution US polygon
2. Creating an outward buffer of ~15km 
3. Creating an inward buffer of ~15km
4. Subtracting the inner from the outer to create a "thick outline" along the coast

This allows point-in-polygon tests to validate coastal locations without needing to check water bodies. You can read about the details of this kludge in buoyant/tools/COASTAL_BOUNDARY.md

### Spatial Indexing with Geohashes
Tide station locations are stored using geohashes as keys. The geohash itself encodes the latitude/longitude, eliminating the need for separate coordinate lookups while providing built-in spatial proximity.

### NWS Gridpoint Wave Data
NOAA's Weather Service provides wave data on a 2.5km grid, but not all coastal gridpoints have marine data. The library implements an expanding ring search:
1. Check the target gridpoint
2. If no data, check 8 immediate neighbors
3. If still no data, expand to 12 outer neighbors
4. Return data from the first gridpoint that has it

This handles the sparse coverage without requiring pre-mapping of valid gridpoints.

### NDBC Station Discovery
The comprehensive NDBC station list was built by scraping station metadata from NOAA's website, as they don't provide a complete API endpoint for all stations with coordinates.

### Zip Code Resolution
The NWS forecast.weather.gov site accepts zip codes and redirects to a URL containing coordinates. This library leverages that redirect to convert zip codes to lat/lon without requiring a geocoding API.

### The Wave Steepness Mystery 🤔
NDBC spectral data includes a `STEEPNESS` field with values: `AVERAGE`, `STEEP`, `VERY_STEEP`, and inexplicably, `SWELL`. NOAA provides no documentation on what these mean. Best guesses:
- `AVERAGE` - Normal wave steepness ratio
- `STEEP` - Waves breaking more abruptly than normal
- `VERY_STEEP` - Approaching critical steepness, expect powerful breaking waves
- `SWELL` - ??? Your guess is as good as mine. Maybe clean groundswell? Maybe a data error? I interpreted it as "promising conditions" but honestly, who knows

If anyone figures out what NDBC actually means by these classifications, please let me know.

## Known Issues

- NDBC buoys can go offline without warning
- Some coastal zip codes may not have nearby data
- Government servers occasionally timeout
- Data can be 1-2 hours old
- Inland locations like Denver give you a helpful warning that they are, in fact, inland. Towns on the border between Mexico and Canada do not give you the same warning -- this is due to the coastal boundary doughnut including national borders

## Contributing

HAHAHAHHAHAHAHAHAAAA

No. I'm done with this. Do what you will.

## Example Output

```
terminal > buoyant report 96815 --radius 15 # Default is 25km
Loaded 1502 NDBC stations from ndbc-stations.json
Loaded 298 tide stations
Loaded coastal boundary validation

🌊 COMPREHENSIVE MARINE REPORT
📍 Honolulu
🕰️ 9/18/2025, 8:50:11 PM
══════════════════════════════════════════════════

🌊 WAVES
──────────────────────────────
Height: 1.2m (3.9ft)
Dominant Period: 6s
Average Period: 5.7s
Direction: 147°
Source: Buoy 51211 (10.8km away)

💨 WIND
──────────────────────────────
Speed: 3.6 m/s
Direction: 70°
Gusts: 6.7 m/s
Source: Buoy OOUH1 (1.0km away)

🌊 TIDES
──────────────────────────────
Current Level: 0.211 m
As of: 8:42:00 PM

Next 4 Tide Changes:
  🔺 high: 02:01 AM (0.329 m)
  🔻 low: 07:17 AM (0.079 m)
  🔺 high: 02:12 PM (0.665 m)
  🔻 low: 09:03 PM (0.069 m)
Station: 1612340 (1.0km away)

🌡️ WATER TEMPERATURE
──────────────────────────────
27°C

☁️ WEATHER
──────────────────────────────
Temperature: 81°F (27.2°C)
Conditions: Mostly Clear
Humidity: 67%
Visibility: 10.0 miles
Pressure: 1017.3 mb

Forecast:
  Tonight: 78°F - Scattered Rain Showers
  Friday: 85°F - Scattered Rain Showers then Mostly Sunny
  Friday Night: 79°F - Scattered Rain Showers

📡 AVAILABLE DATA SOURCES
──────────────────────────────

Nearby Buoys:
  OOUH1: 1612340 - Honolulu, HI (1.0km)
  KNOH1: Kilo Nalu Observatory, Hawaii (2.1km)
  51211: Pearl Harbor Entrance, HI (233) (10.8km)

Tide Stations:
  1612340: Unknown (1.0km)

══════════════════════════════════════════════════
Try specific buoy: buoyant buoy <id> --spectral
```

## License

MIT

## Credits

Data provided by NOAA/NDBC/NWS.
