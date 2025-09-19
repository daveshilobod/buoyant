#!/usr/bin/env python3
"""
Buoyant Python Wrapper
Makes the Node.js CLI feel like a native Python tool

Usage:
    python buoyant.py report 96815
    python buoyant.py buoy 51201
    
Or make it executable:
    chmod +x buoyant.py
    ./buoyant.py report 96815
"""

import sys
import os
import subprocess
import json
from pathlib import Path

class Buoyant:
    def __init__(self):
        self.script_dir = Path(__file__).parent
        self.cli_path = self.script_dir / "cli.js"
        
        # Ensure cli.js is executable
        if not os.access(self.cli_path, os.X_OK):
            os.chmod(self.cli_path, 0o755)
    
    def run(self, args=None):
        """Run the buoyant CLI with given arguments"""
        if args is None:
            args = sys.argv[1:]
        
        cmd = ["node", str(self.cli_path)] + args
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            print(result.stdout)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            return result.returncode
        except subprocess.CalledProcessError as e:
            print(f"Error: {e}", file=sys.stderr)
            return 1
    
    def get_json(self, command, *args):
        """Get JSON output from buoyant commands"""
        cmd = ["node", str(self.cli_path), command] + list(args) + ["--json"]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return json.loads(result.stdout)
        except subprocess.CalledProcessError as e:
            print(f"Error: {e}", file=sys.stderr)
            return None
        except json.JSONDecodeError:
            print("Failed to parse JSON response", file=sys.stderr)
            return None
    
    # Convenience methods for Python usage
    def report(self, location):
        """Get comprehensive marine report"""
        return self.get_json("report", str(location))
    
    def buoy(self, buoy_id):
        """Get data from specific buoy"""
        return self.get_json("buoy", str(buoy_id))
    
    def coords(self, lat, lng):
        """Get conditions for coordinates"""
        return self.get_json("coords", "--", str(lat), str(lng))

def main():
    buoyant = Buoyant()
    return buoyant.run()

if __name__ == "__main__":
    # When run as a script, act as CLI wrapper
    sys.exit(main())
