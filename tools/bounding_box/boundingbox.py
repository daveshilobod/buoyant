"""
1. pass four sets of geo-coordinates
2. construct a bounding box using those as corners
3. make four API calls to api.weather.gov, one for each corner, to obtain the grid information for those corners
4. use the grid information to derive the other grids within the bounding box
5. estimate the geo-coordinates of each grid's center point
6. return a .json file containing an object for each grid that includes:
   1. the grid (e.g. (154,143), (154,144), etc.)
   2. the estimated geocoordinates of that grid's center point to 4 decimal points, e.g. lat:47.5678, lng:-150,1234
"""
import requests
import json
import time
import random
import geohash as gh

def adjust_corner(corner, shift=0.01):
    # If the request for the corner fails, shift it south and east
    return (corner[0] - shift, corner[1] + shift)


def get_grid_squares_in_rectangle(corner0, corner1, corner2, corner3):
    # Define the weather layers to check
    weather_layers = [
        "temperature", "windDirection", "windSpeed", "windGust",
        "skyCover", "waveHeight", "wavePeriod", "waveDirection",
        "primarySwellHeight", "primarySwellDirection", "secondarySwellHeight",
        "secondarySwellDirection", "wavePeriod2", "windWaveHeight"
    ]

    # Define headers
    headers = {"User-Agent": "email@example.com"}

    # Make API calls to retrieve the grid information for each corner
     # Make API calls to retrieve the grid information for each corner
    responses = []
    valid_count = 0  # Initialize valid grid count
    for i, corner in enumerate([corner0, corner1, corner2, corner3]):
        while True:
            url = f"https://api.weather.gov/points/{corner[0]},{corner[1]}"
            try:
                response = requests.get(url, headers=headers)
                response.raise_for_status()  # Raises an HTTPError if the status is 4xx, 5xx
            except requests.RequestException as e:
                print(f"Request to {url} failed due to {e}. Adjusting corners and retrying.")
                if i == 0:  # northwest corner
                    corner0 = adjust_corner(corner)
                    corner = corner0
                elif i == 1:  # northeast corner
                    corner1 = adjust_corner(corner)
                    corner = corner1
                elif i == 2:  # southwest corner
                    corner2 = adjust_corner(corner)
                    corner = corner2
                elif i == 3:  # southeast corner
                    corner3 = adjust_corner(corner)
                    corner = corner3
                continue  # retry with the adjusted corner
            break  # if no exception is raised, break the loop and proceed to the next corner
        print(f"Valid corner found at: {corner}")
        responses.append(response.json())
        valid_count += 1  # Increment valid grid count

    # Extract grid coordinates from the responses
    grid_coordinates = []
    for response in responses:
        properties = response["properties"]
        if "gridId" in properties and "gridX" in properties and "gridY" in properties:
            grid_id = properties["gridId"]
            grid_x = properties["gridX"]
            grid_y = properties["gridY"]
            if grid_id is not None and grid_x is not None and grid_y is not None:
                grid_coordinates.append((grid_id, grid_x, grid_y))
            else:
                print(f'None values found in response: {response}')

    # Calculate the min and max grid coordinates
    min_grid_x = min(coordinate[1] for coordinate in grid_coordinates)
    max_grid_x = max(coordinate[1] for coordinate in grid_coordinates)
    min_grid_y = min(coordinate[2] for coordinate in grid_coordinates)
    max_grid_y = max(coordinate[2] for coordinate in grid_coordinates)

    # The grid_id should be same for all corners. So, let's use the first one.
    grid_id = grid_coordinates[0][0]

    # Calculate the grid squares within the bounding box
    grid_squares = {}
    min_lat, max_lat, min_lng, max_lng = float('inf'), float('-inf'), float('inf'), float('-inf')
    for grid_x in range(min_grid_x, max_grid_x+1):
        for grid_y in range(min_grid_y, max_grid_y+1):
            # Introduce delay and jitter
            time.sleep(.5 + random.uniform(-0.05, 0.05))

            # Center of the grid square in lat/lon
            # We'll make a request for each grid square
            url = f"https://api.weather.gov/gridpoints/{grid_id}/{grid_x},{grid_y}"
            try:
                response = requests.get(url, headers=headers)
                response.raise_for_status()
            except requests.RequestException as e:
                print(f"Request to {url} failed due to {e}. Skipping this grid square.")
                continue

            response_json = response.json()

            # Ensure the necessary data is in the response
            if "geometry" in response_json and "coordinates" in response_json["geometry"]:
                coordinates = response_json["geometry"]["coordinates"][0]  # first item in the outer list
                lat = round(sum(coordinate[1] for coordinate in coordinates) / len(coordinates), 4)
                lon = round(sum(coordinate[0] for coordinate in coordinates) / len(coordinates), 4)
                min_lat = min(min_lat, lat)
                max_lat = max(max_lat, lat)
                min_lng = min(min_lng, lon)
                max_lng = max(max_lng, lon)

                # Compute the geohash of the center point of the grid square
                geohash_center = gh.encode(lat, lon, precision=7)

                # Check for each weather layer
                weather_layer_availability = {}
                for layer in weather_layers:
                    values = response_json["properties"].get(layer, {}).get("values")
                    value = values[0]["value"] if values and "value" in values[0] else None
                    weather_layer_availability[layer] = value is not None and value != 0

                grid_key = f"({grid_x}, {grid_y})"
                grid_squares[grid_key] = {
                    "gridId": grid_id,
                    "geohashCenter": geohash_center,
                    "gridX": grid_x,
                    "gridY": grid_y,
                    "latitude": round(lat, 4),
                    "longitude": round(lon, 4),
                    "layers": weather_layer_availability
                }
                valid_count += 1  # Increment valid grid count

    # Compute the geohash of the center point of the bounding box
    center_lat = (max_lat + min_lat) / 2
    center_lng = (max_lng + min_lng) / 2
    geohash_bounding_box = gh.encode(center_lat, center_lng, precision=4)

    # Save grid information to a JSON file
    with open(f"{geohash_bounding_box}.json", "w") as file:
        json.dump(grid_squares, file)

    print(f"Total number of valid grids: {valid_count}")
    print(f"Grid square information saved as {geohash_bounding_box}.json")
# Example usage
corner0 = (44.6519, -68.3069) #northwest
corner1 = (44.8804, -67.0136) #northeast
corner2 = (44.2204, -68.1855) #southwest
corner3 = (44.4123, -66.9769) #southeast


get_grid_squares_in_rectangle(corner0, corner1, corner2, corner3)

