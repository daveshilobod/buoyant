import os
import json

def transform_and_load_json_files(directory):
    data = {}
    files = [f for f in os.listdir(directory) if f.endswith('.json')]
    for file in files:
        with open(os.path.join(directory, file), 'r') as f:
            file_data = json.load(f)
        transformed_data = {item["geohashCenter"]: item for item in file_data.values()}
        data.update(transformed_data)
        transformed_filename = f"{file}_transformed.json"
        with open(os.path.join(directory, transformed_filename), 'w') as f:
            json.dump(transformed_data, f)
    return data

def find_duplicates(data):
    unique_data = {}
    duplicates = []
    geohash_only_duplicates = []
    geohash_property_mismatches = []

    for geohash, value in data.items():
        if geohash not in unique_data:
            unique_data[geohash] = value
        else:
            # Check for exact duplicate
            if value == unique_data[geohash]:
                duplicates.append(value)
            else:
                # Check for geohash only duplicate
                value_no_geohash = {k: v for k, v in value.items() if k != 'geohashCenter'}
                unique_no_geohash = {k: v for k, v in unique_data[geohash].items() if k != 'geohashCenter'}
                if value_no_geohash == unique_no_geohash:
                    geohash_only_duplicates.append(value)
                else:
                    geohash_property_mismatches.append(value)

    return unique_data, duplicates, geohash_only_duplicates, geohash_property_mismatches

def write_report(total_count, duplicates, geohash_only_duplicates, geohash_property_mismatches, filename):
    with open(filename, 'w') as f:
        f.write(f"Total count of objects from source files: {total_count}\n")
        f.write(f"Duplicate objects found: {len(duplicates)}\n")
        f.write(f"Count of objects that are identical except for the geohashCenter: {len(geohash_only_duplicates)}\n")
        f.write(f"Count of objects where 'geohashCenter' is duplicated but the other properties are not identical: {len(geohash_property_mismatches)}\n")


directory = 'jsonmerge'  # replace with the actual directory path
data = transform_and_load_json_files(directory)
unique_data, duplicates, geohash_only_duplicates, geohash_property_mismatches = find_duplicates(data)

with open(os.path.join(directory, 'nwsStations.json'), 'w') as f:
    json.dump(unique_data, f, indent=4)

write_report(len(data), duplicates, geohash_only_duplicates, geohash_property_mismatches, os.path.join(directory, 'report.txt'))
