import time
import random
import requests
import json
import math

user_agent = {'User-Agent': 'email@example.com', 'Accept': 'application/geo+json'}

def get_wave_height():
    lat = 21.2854
    lon = -157.8357
    response = requests.get(f"https://api.weather.gov/points/{lat},{lon}", headers=user_agent)
    response_json = json.loads(response.text)
    
    origin_grid_x, origin_grid_y = response_json['properties']['gridX'], response_json['properties']['gridY']
    grid_id = response_json['properties']['gridId']
    
    max_search_radius = 2  # Approx 100 km
    search_radius = 1
    grid_points_checked = []  # List to store grid points checked

    while search_radius <= max_search_radius:
        for x in range(origin_grid_x - search_radius, origin_grid_x + search_radius + 1):
            for y in range(origin_grid_y - search_radius, origin_grid_y + search_radius + 1):
                # Adding delay with some jitter
                time.sleep(1 + random.uniform(-0.5, 0.5))
                
                grid_response = requests.get(f"https://api.weather.gov/gridpoints/{grid_id}/{x},{y}", headers=user_agent)
                grid_response_json = json.loads(grid_response.text)
                
                # Calculate distance from origin grid point
                distance = math.sqrt((origin_grid_x - x)**2 + (origin_grid_y - y)**2)
                grid_points_checked.append({'gridX': x, 'gridY': y, 'distance': distance})
                print(f"Checked grid point ({x},{y}) with distance {distance} from origin.")
                
                if 'waveHeight' in grid_response_json['properties']:
                    wave_height_values = grid_response_json['properties']['waveHeight']['values']
                    if wave_height_values and wave_height_values[0]['value'] is not None:
                        return wave_height_values[0]['value'], {'lat': lat, 'lon': lon}, {'gridX': x, 'gridY': y}, grid_points_checked
        
        search_radius += 1
    
    return None, None, None, grid_points_checked  # Return None if no wave height was found within the maximum search radius

wave_height, location, grid_point, grid_points_checked = get_wave_height()
if wave_height is not None and location is not None and grid_point is not None:
    print(f"\nWave height: {wave_height}")
    print(f"Location: {location}")
    print(f"Grid point where wave height was found: {grid_point}")
else:
    print("\nNo wave height data found within the specified radius.")

print("\nGrid points checked:")
for point in grid_points_checked:
    print(f"Grid point ({point['gridX']},{point['gridY']}) with distance {point['distance']} from origin.")
