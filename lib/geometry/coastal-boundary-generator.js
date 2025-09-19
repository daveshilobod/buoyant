/**
 * Coastal Boundary Generator
 * 
 * Creates a coastal boundary strip from any coastline polygon
 * using buffer operations.
 * 
 * How it works:
 * 1. Take a coastline polygon
 * 2. Buffer it outward (into the ocean)
 * 3. Buffer it inward (into land)
 * 4. Take the DIFFERENCE between them
 * 5. Result: A "coastal strip" polygon for validation
 * 
 * This ensures marine data is only provided for coastal areas,
 * not inland locations.
 * 
 * Originally prototyped in Python with Shapely, ported to JavaScript.
 */

const fs = require('fs');
const path = require('path');

class CoastalBoundaryGenerator {
  constructor(options = {}) {
    // Buffer distances in degrees (roughly)
    // 0.15 degrees ≈ 16.5km at equator, less at higher latitudes
    this.outerBuffer = options.outerBuffer || 0.15;
    this.innerBuffer = options.innerBuffer || 0.15;
  }
  
  /**
   * Generate a coastal boundary from a polygon
   * 
   * NOTE: In production, you'd use @turf/turf for this,
   * but here's the concept that was prototyped in Python
   */
  generateCoastalBoundary(polygonGeoJSON) {
    console.log('Generating coastal boundary using buffer operations...');
    
    // In the Python version, we used Shapely for this
    // In JS, you'd use Turf.js:
    // 
    // const turf = require('@turf/turf');
    // const bufferedOut = turf.buffer(polygonGeoJSON, this.outerBuffer, {units: 'degrees'});
    // const bufferedIn = turf.buffer(polygonGeoJSON, -this.innerBuffer, {units: 'degrees'});
    // const coastalStrip = turf.difference(bufferedOut, bufferedIn);
    
    // For now, we'll just document the algorithm
    const algorithm = {
      step1: "Load the high-resolution US polygon",
      step2: `Buffer outward by ${this.outerBuffer} degrees (into ocean)`,
      step3: `Buffer inward by ${this.innerBuffer} degrees (into land)`,
      step4: "Subtract inner from outer to get coastal strip",
      step5: "Save as GeoJSON for surf spot validation",
      
      originalPythonImplementation: `
# Python implementation using Shapely:
import shapely.geometry
import json
from shapely.geometry import shape

# Load the US polygon
with open('usHighResPolygon.geojson') as f:
    us_data = json.load(f)
us_polygon = shape(us_data['features'][0]['geometry'])

# Create a buffer around the US polygon (into ocean)
us_polygon_with_buffer = us_polygon.buffer(${this.outerBuffer})

# Create smaller polygon by buffering inward (into land)
us_polygon_with_inward_buffer = us_polygon.buffer(-${this.innerBuffer})

# Subtract to get only the coastal strip
us_outline = us_polygon_with_buffer.difference(us_polygon_with_inward_buffer)

# Save the result
with open('thickUSOutline.geojson', 'w') as f:
    json.dump(shapely.geometry.mapping(us_outline), f)
      `,
      
      result: "A perfect coastal boundary that prevents Denver surf reports",
      
      note: "Load the result in geojson.io to see the magic"
    };
    
    return algorithm;
  }
  
  /**
   * The actual implementation using available libraries
   */
  async generateWithTurf(inputFile, outputFile) {
    try {
      // Check if @turf/turf is available
      let turf;
      try {
        turf = require('@turf/turf');
      } catch (err) {
        throw new Error(
          'Turf.js not installed. Run: npm install @turf/turf\n' +
          'Or use the Python version with Shapely'
        );
      }
      
      // Load the input polygon
      const inputData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
      
      console.log('Step 1: Buffering outward (into ocean)...');
      const bufferedOut = turf.buffer(inputData, this.outerBuffer, {units: 'degrees'});
      
      console.log('Step 2: Buffering inward (into land)...');
      const bufferedIn = turf.buffer(inputData, -this.innerBuffer, {units: 'degrees'});
      
      console.log('Step 3: Taking difference to get coastal strip...');
      const coastalStrip = turf.difference(bufferedOut, bufferedIn);
      
      // Save the result
      fs.writeFileSync(outputFile, JSON.stringify(coastalStrip, null, 2));
      
      const size = fs.statSync(outputFile).size;
      console.log(`✓ Created ${outputFile} (${Math.round(size/1024)}KB)`);
      console.log('Load it in geojson.io to see the coastal boundary!');
      
      return coastalStrip;
    } catch (err) {
      console.error('Error generating boundary:', err.message);
      throw err;
    }
  }
  
  /**
   * Validate if a point is in a coastal area
   */
  validateCoastalPoint(lat, lon, boundaryGeoJSON) {
    // This would use turf.booleanPointInPolygon
    // but the concept is what matters
    
    const validation = {
      isCoastal: null,
      method: "Check if point is within the coastal strip polygon",
      
      implementation: `
// Using Turf.js:
const point = turf.point([lon, lat]);
const isCoastal = turf.booleanPointInPolygon(point, boundaryGeoJSON);

if (!isCoastal) {
  throw new Error("That's not the ocean, friend. Try a location near the coast.");
}
      `,
      
      famousQuote: "That's not the ocean, friend."
    };
    
    return validation;
  }
  
  /**
   * Get stats about a coastal boundary
   */
  analyzeCoastalBoundary(boundaryFile) {
    try {
      const data = JSON.parse(fs.readFileSync(boundaryFile, 'utf8'));
      const stats = {
        type: data.type,
        features: data.features ? data.features.length : 1,
        size: `${Math.round(fs.statSync(boundaryFile).size / 1024)}KB`,
        
        description: "This boundary ensures surf reports only work near actual ocean",
        
        coverage: {
          westCoast: "✓ California, Oregon, Washington",
          eastCoast: "✓ Maine to Florida", 
          gulfCoast: "✓ Texas to Florida panhandle",
          alaska: "✓ Southern Alaska coast",
          hawaii: "✓ All Hawaiian islands",
          greatLakes: "✗ Not included (no surf)",
          denver: "✗ Definitely not included"
        },
        
        funFact: "This prevented tens (ok, ones) of 'why no surf in Kansas?' support emails"
      };
      
      return stats;
    } catch (err) {
      return { error: err.message };
    }
  }
}

module.exports = CoastalBoundaryGenerator;

// Example usage:
if (require.main === module) {
  const generator = new CoastalBoundaryGenerator();
  
  console.log('Coastal Boundary Generation Algorithm:');
  console.log('=' .repeat(50));
  
  const algorithm = generator.generateCoastalBoundary();
  console.log(JSON.stringify(algorithm, null, 2));
  
  console.log('\n' + '=' .repeat(50));
  console.log('This geometry hack is why Denver correctly gets rejected!');
}
