import time
import random
import requests
import json
import math

user_agent = {'User-Agent': 'email@example.com', 'Accept': 'application/geo+json'}

def get_station_data(grid_id, x, y):
    print("Inside get_station_data")  # Debug
    time.sleep(1 + random.uniform(-0.5, 0.5))  # Add delay with some jitter
    grid_response = requests.get(f"https://api.weather.gov/gridpoints/{grid_id}/{x},{y}", headers=user_agent)
    if grid_response.status_code != 200:  # If response is not successful, return None
        print(f"Failed to get data for station {x}, {y} with response code: {grid_response.status_code}")
        return {key: None for key in ['waveHeight', 'wavePeriod', 'waveDirection', 'primarySwellHeight', 'primarySwellDirection', 'secondarySwellHeight', 'secondarySwellDirection', 'windSpeed', 'windDirection', 'windWaveHeight', 'temperature']}
    
    grid_response_json = json.loads(grid_response.text)
    print(f"Response from station {x}, {y}: {grid_response_json}")  # Debug

    # Parse and return the needed data points, returning None if not found
    return {
        'waveHeight': grid_response_json['properties'].get('waveHeight', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('waveHeight', {}).get('values', [])) > 0 else None,
        'wavePeriod': grid_response_json['properties'].get('wavePeriod', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('wavePeriod', {}).get('values', [])) > 0 else None,
        'waveDirection': grid_response_json['properties'].get('waveDirection', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('waveDirection', {}).get('values', [])) > 0 else None,
        'primarySwellHeight': grid_response_json['properties'].get('primarySwellHeight', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('primarySwellHeight', {}).get('values', [])) > 0 else None,
        'primarySwellDirection': grid_response_json['properties'].get('primarySwellDirection', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('primarySwellDirection', {}).get('values', [])) > 0 else None,
        'secondarySwellHeight': grid_response_json['properties'].get('secondarySwellHeight', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('secondarySwellHeight', {}).get('values', [])) > 0 else None,
        'secondarySwellDirection': grid_response_json['properties'].get('secondarySwellDirection', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('secondarySwellDirection', {}).get('values', [])) > 0 else None,
        'windSpeed': grid_response_json['properties'].get('windSpeed', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('windSpeed', {}).get('values', [])) > 0 else None,
        'windDirection': grid_response_json['properties'].get('windDirection', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('windDirection', {}).get('values', [])) > 0 else None,
        'windWaveHeight': grid_response_json['properties'].get('windWaveHeight', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('windWaveHeight', {}).get('values', [])) > 0 else None,
        'temperature': grid_response_json['properties'].get('temperature', {}).get('values', [{}])[0].get('value') if len(grid_response_json['properties'].get('temperature', {}).get('values', [])) > 0 else None
    }


def get_surf_report_data(user_coords):
    print("Inside get_surf_report_data")  # Debug
    lat, lon = user_coords['latitude'], user_coords['longitude']
    response = requests.get(f"https://api.weather.gov/points/{lat},{lon}", headers=user_agent)
    response_json = json.loads(response.text)
    print(f"Response from user location {lat}, {lon}: {response_json}")  # Debug
    
    grid_x, grid_y = response_json['properties']['gridX'], response_json['properties']['gridY']
    grid_id = response_json['properties']['gridId']

    max_search_radius = 8  # Approx 20 km
    search_radius = 1

    data_points = ['waveHeight', 'wavePeriod', 'waveDirection', 'primarySwellHeight', 'primarySwellDirection', 'secondarySwellHeight', 'secondarySwellDirection', 'windSpeed', 'windDirection', 'windWaveHeight', 'temperature']
    closest_stations = {point: None for point in data_points}

    while search_radius <= max_search_radius:
        print(f"Current search_radius: {search_radius}")  # Debug
        for x in range(grid_x - search_radius, grid_x + search_radius + 1):
            for y in range(grid_y - search_radius, grid_y + search_radius + 1):
                station_coords = {'gridX': x, 'gridY': y}  # Replace with actual lat, lon values
                
                if math.sqrt((grid_x - x)**2 + (grid_y - y)**2) *2.5 > 20:  # Skip if distance > 20 km
                    break

                station_data = get_station_data(grid_id, x, y)

                # For each data point, check if this station provides it and if it's closer than the current closest station
                for point in data_points:
                    if station_data[point] is not None and (closest_stations[point] is None or math.sqrt((grid_x - x)**2 + (grid_y - y)**2) < math.sqrt((grid_x - closest_stations[point]['coords']['gridX'])**2 + (grid_y - closest_stations[point]['coords']['gridY'])**2)):
                        closest_stations[point] = {
                            'coords': station_coords,
                            'value': station_data[point],
                            'distance': math.sqrt((grid_x - x)**2 + (grid_y - y)**2),
                            'direction': math.degrees(math.atan2(y - grid_y, x - grid_x))  # Direction from user grid point to this grid point
                        }

        search_radius += 1

    return closest_stations

print("Start of the script")  # Debug
user_coords = {'latitude': 21.2854, 'longitude': -157.8357}
data = get_surf_report_data(user_coords)
print("End of the script")  # Debug
print(data)  # Debug
