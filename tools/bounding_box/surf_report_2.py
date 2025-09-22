import time
import random
import requests
import json
import math

user_agent = {'User-Agent': 'email@example.com', 'Accept': 'application/geo+json'}

def get_wave_data():
    lat = 21.2854
    lon = -157.8357
    response = requests.get(f"https://api.weather.gov/points/{lat},{lon}", headers=user_agent)
    response_json = json.loads(response.text)

    origin_grid_x, origin_grid_y = response_json['properties']['gridX'], response_json['properties']['gridY']
    grid_id = response_json['properties']['gridId']

    max_search_radius = 2  # Approx 5 km
    search_radius = 1
    grid_points_checked = []  # List to store grid points checked
    wave_data = {}  # Dictionary to store nearest wave data for each data point

    while search_radius <= max_search_radius:
        for x in range(origin_grid_x - search_radius, origin_grid_x + search_radius + 1):
            for y in range(origin_grid_y - search_radius, origin_grid_y + search_radius + 1):
                if abs(origin_grid_x - x) <= search_radius and abs(origin_grid_y - y) <= search_radius:
                    # Adding delay with some jitter
                    time.sleep(1 + random.uniform(-0.5, 0.5))

                    grid_response = requests.get(f"https://api.weather.gov/gridpoints/{grid_id}/{x},{y}", headers=user_agent)
                    grid_response_json = json.loads(grid_response.text)

                    # Calculate distance from origin grid point
                    distance = math.sqrt((origin_grid_x - x) ** 2 + (origin_grid_y - y) ** 2)
                    grid_points_checked.append({'gridX': x, 'gridY': y, 'distance': distance})
                    print(f"Checked grid point ({x},{y}) with distance {distance} from origin.")

                    if 'properties' in grid_response_json:
                        properties = grid_response_json['properties']
                        for data_point in ['wavePeriod', 'waveDirection', 'primarySwellHeight',
                                           'primarySwellDirection', 'secondarySwellHeight',
                                           'secondarySwellDirection', 'windSpeed', 'windDirection',
                                           'windWaveHeight', 'temperature', 'waveHeight']:
                            if data_point in properties:
                                values = properties[data_point]['values']
                                if values and values[0]['value'] is not None:
                                    if data_point not in wave_data or distance < wave_data[data_point]['distance']:
                                        wave_data[data_point] = {
                                            'value': values[0]['value'],
                                            'location': {'lat': lat, 'lon': lon},
                                            'grid_point': {'gridX': x, 'gridY': y},
                                            'distance': distance
                                        }

        search_radius += 1

    return wave_data, grid_points_checked

wave_data, grid_points_checked = get_wave_data()

if wave_data:
    print("\nWave data:")
    for data_point, data in wave_data.items():
        print(f"{data_point}:")
        print(f"  Value: {data['value']}")
        print(f"  Location: {data['location']}")
        print(f"  Grid point: {data['grid_point']}")
else:
    print("\nNo wave data found within the specified radius.")

print("\nGrid points checked:")
for point in grid_points_checked:
    print(f"Grid point ({point['gridX']},{point['gridY']}) with distance {point['distance']} from origin.")
