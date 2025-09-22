import shapely.geometry
import json
from shapely.geometry import shape

# Load the US polygon
with open('usHighResPolygon.geojson') as f:
    us_data = json.load(f)
us_polygon = shape(us_data['features'][0]['geometry'])

# Create a buffer around the US polygon
us_polygon_with_buffer = us_polygon.buffer(0.15)  # might need to adjust this value

# Create a smaller polygon by buffering the original US polygon inwards
us_polygon_with_inward_buffer = us_polygon.buffer(-0.15)  # might need to adjust this value too, they're both touchy. Load them in http://geojson.io to see the results

# Subtract the smaller polygon from the buffered polygon to get only the "outline" area
us_outline = us_polygon_with_buffer.difference(us_polygon_with_inward_buffer)

# Convert the outline result back to a GeoJSON Feature
us_outline_feature = {
    "type": "Feature",
    "properties": {},
    "geometry": shapely.geometry.mapping(us_outline)
}

# Create a GeoJSON FeatureCollection containing the outline feature
us_outline_feature_collection = {
    "type": "FeatureCollection",
    "features": [us_outline_feature]
}

# Save the result
with open('thickUSOutline.geojson', 'w') as f:
    json.dump(us_outline_feature_collection, f)
