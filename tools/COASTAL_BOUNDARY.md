# The Coastal Boundary Technique

## Problem
How do you determine if a lat/lon coordinate is "coastal" without:
- Making expensive API calls
- Maintaining a database of water bodies
- Complex distance-to-water calculations
- Dealing with lakes, rivers, and other inland water

## Solution: The Doughnut (or donut if you're nasty)

Instead of asking "how far is this point from water?", we ask "is this point in the coastal zone?"

### How it works

1. Start with a high-resolution US polygon (land only)
2. Create an **outer buffer** 0.15° around it (~15km expansion)
3. Create an **inner buffer** -0.15° into it (~15km contraction)
4. Subtract inner from outer = coastal ring/"doughnut"

```python
# The magic is just three lines
outer = us_polygon.buffer(0.15)   # Expand outward
inner = us_polygon.buffer(-0.15)  # Contract inward
coastal_zone = outer.difference(inner)  # The doughnut!
```

### Why it works

- **O(1) lookup**: Point-in-polygon test is instant
- **No false positives**: Lakes/rivers aren't included (they're inside the inner buffer)
- **Perfect coverage**: Follows every inlet, bay, and island
- **Zero dependencies**: Just needs the polygon file
- **Offline capable**: No API calls needed

### Edge cases handled

- **Islands**: Get their own doughnut ring
- **Peninsulas**: Covered on all sides
- **Bays/Inlets**: The buffer follows the coastline in
- **Great Lakes**: Included since they're on the polygon edge
- **Rivers**: Excluded (too narrow to create a gap in the doughnut)

### 0.15° Close enough for horseshoes 

Why 0.15 degrees (~15km)?

- Far enough to catch most coastal weather stations
- Close enough to exclude inland areas
- NDBC buoys are typically within 50km of shore
- NWS marine forecasts cover ~20km offshore
- Sweet spot for "marine-influenced" weather

You can adjust this value based on your needs:
- 0.1° (~10km): Stricter coastal definition
- 0.2° (~20km): More generous coverage
- 0.3° (~30km): Include near-coastal inland areas

### Testing your polygon

Load the GeoJSON files at http://geojson.io to visualize:
- `usHighResPolygon.geojson`: Original US boundary
- `thickUSOutline.geojson`: The coastal doughnut

### Performance

With the polygon loaded in memory:
- Point-in-polygon test: ~0.001ms
- No network latency
- No rate limits
- Works offline

This replaced what would have been hundreds of API calls or a complex PostGIS setup with a simple geometry operation and a 1MB GeoJSON file.

## Credit

This technique was developed for RideAI to validate coastal locations without depending on external services. It's one of those solutions that seems obvious in hindsight but took some work with the ol' thinkin' cap.
