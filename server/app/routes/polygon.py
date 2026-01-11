"""
Polygon analysis route for analyzing polygons and fetching building footprints from OpenStreetMap.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List
import requests
from shapely.geometry import shape
from shapely.ops import transform

# Try to import pyproj, but make it optional
try:
    import pyproj
    HAS_PYPROJ = True
except ImportError:
    HAS_PYPROJ = False

router = APIRouter(tags=["Polygon"])


# Request/Response models
class PolygonRequest(BaseModel):
    polygon: Dict[str, Any]  # GeoJSON Polygon


class PolygonResponse(BaseModel):
    areaM2: float
    buildings: Dict[str, Any]  # GeoJSON FeatureCollection


def calculate_area_m2(polygon: Dict[str, Any]) -> float:
    """Calculate area of a GeoJSON Polygon in square meters using UTM projection (requires pyproj) or approximation fallback."""
    geom = shape(polygon)
    bounds = geom.bounds  # (minx, miny, maxx, maxy)
    lat_mid = (bounds[1] + bounds[3]) / 2
    
    # Try using pyproj for accurate calculation if available
    if HAS_PYPROJ:
        try:
            # Get centroid to determine appropriate UTM zone
            centroid = geom.centroid
            lon, lat = centroid.x, centroid.y
            
            # Use appropriate UTM zone based on longitude
            utm_zone = int((lon + 180) / 6) + 1
            utm_code = 32600 + utm_zone if lat >= 0 else 32700 + utm_zone  # Northern/Southern hemisphere
            
            # Transform to UTM for accurate area calculation
            # Use pyproj 3.x API with Transformer
            wgs84 = pyproj.CRS("EPSG:4326")
            utm_crs = pyproj.CRS(f"EPSG:{utm_code}")
            transformer = pyproj.Transformer.from_crs(wgs84, utm_crs, always_xy=True)
            
            # Wrap transformer.transform for use with shapely.ops.transform
            # shapely.ops.transform expects a function that takes (x, y) and returns (x, y)
            def project(x, y, z=None):
                x_new, y_new = transformer.transform(x, y)
                return (x_new, y_new)
            
            transformed = transform(project, geom)
            area_m2 = transformed.area
            
            return area_m2
        except Exception:
            # Fall through to approximation if pyproj fails
            pass
    
    # Fallback: use approximation if pyproj not available or fails
    import math
    lat_span = bounds[3] - bounds[1]
    lon_span = bounds[2] - bounds[0]
    lat_rad = math.radians(lat_mid)
    # Area approximation accounting for latitude
    # Approximate: 1 degree lat ≈ 111,320 m, 1 degree lon ≈ 111,320 * cos(lat) m
    area_approx = lat_span * 111320 * lon_span * 111320 * abs(math.cos(lat_rad))
    return area_approx


def query_overpass_api(polygon: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Query Overpass API for buildings within the polygon."""
    try:
        geom = shape(polygon)
        bounds = geom.bounds  # (minx, miny, maxx, maxy)
        
        # Build Overpass QL query
        # Query for ways and relations with building tag
        # Bounds format: (south, west, north, east) = (miny, minx, maxy, maxx)
        query = f"""
        [out:json][timeout:25];
        (
          way["building"]({bounds[1]},{bounds[0]},{bounds[3]},{bounds[2]});
          relation["building"]({bounds[1]},{bounds[0]},{bounds[3]},{bounds[2]});
        );
        out geom;
        """
        
        # Overpass API endpoint
        overpass_url = "https://overpass-api.de/api/interpreter"
        
        response = requests.post(overpass_url, data={"data": query}, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        # Convert Overpass JSON to GeoJSON features
        features = []
        for element in data.get("elements", []):
            if element.get("type") == "way":
                # Convert way to GeoJSON Polygon
                if "geometry" in element and len(element["geometry"]) >= 3:
                    coords = [[node["lon"], node["lat"]] for node in element["geometry"]]
                    # Close polygon if not closed
                    if coords[0] != coords[-1]:
                        coords.append(coords[0])
                    
                    feature = {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [coords]
                        },
                        "properties": {
                            "id": element.get("id"),
                            "tags": element.get("tags", {}),
                            "building": element.get("tags", {}).get("building", "yes")
                        }
                    }
                    features.append(feature)
            elif element.get("type") == "relation":
                # Relations are more complex - skip for now or handle members
                # For simplicity, we'll skip relations for now
                pass
        
        # Filter features to only those that intersect with the query polygon
        filtered_features = []
        query_polygon = shape(polygon)
        
        for feature in features:
            feature_geom = shape(feature["geometry"])
            # Check if feature intersects with query polygon (partial or full overlap)
            if query_polygon.intersects(feature_geom):
                filtered_features.append(feature)
        
        return filtered_features
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Overpass API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing buildings: {str(e)}")


@router.post("/analyze", response_model=PolygonResponse)
async def analyze_polygon(request: PolygonRequest):
    """
    Analyze a GeoJSON Polygon:
    - Calculate area in square meters
    - Query OpenStreetMap for building footprints
    - Return area and buildings as GeoJSON FeatureCollection
    """
    try:
        polygon = request.polygon
        
        # Validate GeoJSON Polygon structure
        if polygon.get("type") != "Polygon":
            raise HTTPException(status_code=400, detail="Expected GeoJSON Polygon type")
        
        if "coordinates" not in polygon:
            raise HTTPException(status_code=400, detail="Polygon missing coordinates")
        
        # Calculate area
        area_m2 = calculate_area_m2(polygon)
        
        # Query buildings from Overpass API
        building_features = query_overpass_api(polygon)
        
        # Create GeoJSON FeatureCollection
        feature_collection = {
            "type": "FeatureCollection",
            "features": building_features
        }
        
        return PolygonResponse(areaM2=area_m2, buildings=feature_collection)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
