import shapely.geometry
from shapely.geometry import shape
from shapely.ops import unary_union
import json

# Load the US polygon and the world coast polygon
with open('usPolygon.geojson') as f:
    us_data = json.load(f)
us_polygon = shape(us_data['features'][0]['geometry'])

with open('worldCoastPolygon.geojson') as f:
    world_coast_data = json.load(f)
world_coast_polygon = shape(world_coast_data['features'][0]['geometry'])

# Compute the intersection of the US polygon and the world coast polygon
us_coast = us_polygon.intersection(world_coast_polygon)

# Convert the intersection result back to geojson
us_coast_geojson = json.dumps(shapely.geometry.mapping(us_coast))

# Save the result
with open('usCoast.geojson', 'w') as f:
    f.write(us_coast_geojson)

# Now create a buffered version
buffer_distance_degrees = 5 / 111.325  # Approximate conversion from km to degrees
buffered_us_coast = us_coast.buffer(buffer_distance_degrees)

# Convert the buffered result back to geojson
buffered_us_coast_geojson = json.dumps(shapely.geometry.mapping(unary_union(buffered_us_coast)))

# Save the result
with open('bufferedUsCoast.geojson', 'w') as f:
    f.write(buffered_us_coast_geojson)
