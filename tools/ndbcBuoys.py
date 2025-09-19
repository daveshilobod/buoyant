import requests
from bs4 import BeautifulSoup
import json
import geohash2
import time
import re
##this script gets ndbc buoy data from NOAA's website

def get_station_ids(filename):
    with open(filename, 'r') as f:
        return [line.strip() for line in f.readlines()]

def parse_buoy_data(station_id):
    url = f'https://www.ndbc.noaa.gov/station_page.php?station={station_id}'
    headers = {"contact email: email@example.com"}

    try:
        r = requests.get(url, headers=headers, timeout=10)  # Increase the timeout value as needed
        r.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Failed to retrieve data for station {station_id}: {str(e)}")
        return None, station_id

    soup = BeautifulSoup(r.text, 'html.parser')

    # Check if the page title indicates that the station was not found
    if "Station not found" in soup.title.string:
        print(f"Station {station_id} not found.")
        return None, station_id

    script_tag = soup.find(string=re.compile('const currentstnid'))

    if script_tag is None:
        print(f"Unable to find script tag for station {station_id}.")
        return None, station_id

    script_content = script_tag.string

    id_match = re.search(r"const currentstnid = '(.+?)';", script_content)
    name_match = re.search(r"const currentstnname = '(.*)';", script_content)
    lat_match = re.search(r"const currentstnlat = '(.+?)';", script_content)
    lng_match = re.search(r"const currentstnlng = '(.+?)';", script_content)

    if id_match and lat_match and lng_match:
        id = id_match.group(1)
        name = name_match.group(1) if name_match else f"Station {station_id}"
        latitude = lat_match.group(1)
        longitude = lng_match.group(1)

        return {
            'id': id,
            'name': name,
            'latitude': latitude,
            'longitude': longitude,
            'geohash': geohash2.encode(float(latitude), float(longitude))
        }, None
    else:
        print(f"Failed to extract information for station {station_id}.")
        return None, station_id

def write_buoys_to_file(station_ids, filename):
    buoys = []
    skipped_ids = []

    for station_id in station_ids:
        buoy_data, skipped_id = parse_buoy_data(station_id)

        if buoy_data is not None:
            buoys.append(buoy_data)
        if skipped_id is not None:
            skipped_ids.append(skipped_id)

        # Wait for 1 second before the next request
        time.sleep(3)

    with open(filename, 'w') as f:
        json.dump(buoys, f, indent=4)  # Add indentation for better readability

    with open('skipped_buoy.txt', 'w') as f:
        for sid in skipped_ids:
            f.write(f"{sid}\n")

station_ids = get_station_ids('ndbc_list.txt')
write_buoys_to_file(station_ids, 'buoys.json')
