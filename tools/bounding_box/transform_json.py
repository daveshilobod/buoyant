#transform the json output from boundingbox.py to directly look up an object in the JSON file by its geohashCenter value. It's more efficient than having to search through the entire list of objects for a particular geohashCenter. Bad initial design of that function on my part.

import json
import os

# replace with actual filename
filename = "87y.json"

# load the data from existing JSON file
with open(filename, 'r') as f:
    data = json.load(f)

# transform the data to be keyed by 'geohashCenter' value
transformed_data = {item["geohashCenter"]: item for item in data.values()}

# create a new filename by appending '_transformed.json' to the original filename
base, ext = os.path.splitext(filename)
transformed_filename = f"{base}_transformed{ext}"

# write the transformed data to the new JSON file
with open(transformed_filename, 'w') as f:
    json.dump(transformed_data, f)

print(f"Transformed data written to {transformed_filename}")
