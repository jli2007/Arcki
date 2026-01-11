from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import aiohttp
import asyncio
import json

router = APIRouter()


def parse_query_intent(query: str) -> str:
    """Parse query to determine search intent."""
    query_lower = query.lower()
    
    if any(word in query_lower for word in ["tallest", "tall", "highest", "height"]):
        return "tallest"
    elif any(word in query_lower for word in ["biggest", "largest", "footprint", "area"]):
        return "biggest"
    elif any(word in query_lower for word in ["underdeveloped", "low-rise", "small building", "short building"]):
        return "underdeveloped"
    else:
        return "tallest"  # Default


def calculate_building_features(feature: dict) -> dict:
    """Calculate features for ranking: area, height estimate."""
    props = feature.get("properties", {})
    
    # Calculate area from polygon coordinates
    area = 0
    if "geometry" in feature:
        coords = feature["geometry"].get("coordinates", [])
        if coords and len(coords) > 0 and len(coords[0]) > 0:
            # Shoelace formula for polygon area
            polygon_coords = coords[0]
            n = len(polygon_coords)
            if n > 2:
                area_sum = 0.0
                for i in range(n):
                    j = (i + 1) % n
                    area_sum += polygon_coords[i][0] * polygon_coords[j][1]
                    area_sum -= polygon_coords[j][0] * polygon_coords[i][1]
                # Convert to square meters (rough approximation)
                area = abs(area_sum) / 2 * 111320 * 111320  # degrees to meters
    
    # Height estimate
    height_est = 0
    if "height" in props:
        try:
            height_str = str(props["height"]).replace("m", "").replace("ft", "").strip()
            height_est = float(height_str)
            # If original was in feet, convert (rough check)
            if "ft" in str(props["height"]).lower():
                height_est *= 0.3048  # feet to meters
        except:
            pass
    elif "building:levels" in props:
        try:
            levels = float(str(props["building:levels"]))
            height_est = levels * 3.0  # 3m per level
        except:
            pass
    
    return {
        "area": area,
        "height": height_est
    }


def rank_buildings(features: list, intent: str) -> list:
    """Rank buildings based on intent."""
    # Calculate features for all buildings
    buildings_with_features = []
    for feat in features:
        if feat.get("geometry", {}).get("type") != "Polygon":
            continue  # Skip non-polygons
        
        features_dict = calculate_building_features(feat)
        buildings_with_features.append({
            "feature": feat,
            "area": features_dict["area"],
            "height": features_dict["height"]
        })
    
    # Rank based on intent
    if intent == "tallest":
        buildings_with_features.sort(key=lambda x: x["height"], reverse=True)
    elif intent == "biggest":
        buildings_with_features.sort(key=lambda x: x["area"], reverse=True)
    elif intent == "underdeveloped":
        # Big footprint, low height = underdeveloped
        buildings_with_features.sort(
            key=lambda x: x["area"] / max(x["height"], 3),
            reverse=True
        )
    
    return [b["feature"] for b in buildings_with_features]


def get_building_center(feature: dict) -> list:
    """Get approximate center of building polygon."""
    coords = feature.get("geometry", {}).get("coordinates", [])
    if coords and len(coords[0]) > 0:
        polygon_coords = coords[0]
        lons = [c[0] for c in polygon_coords]
        lats = [c[1] for c in polygon_coords]
        if lons and lats:
            center_lon = sum(lons) / len(lons)
            center_lat = sum(lats) / len(lats)
            return [center_lon, center_lat]
    return [0, 0]


def generate_answer(query: str, intent: str, target_feature: dict) -> str:
    """Generate a short textual answer."""
    props = target_feature.get("properties", {})
    name = props.get("name") or props.get("addr:housename") or props.get("addr:housenumber") or "this building"
    features_dict = calculate_building_features(target_feature)
    height = features_dict.get("height", 0)
    area = features_dict.get("area", 0)
    
    if intent == "tallest":
        height_str = f"{height:.1f}m" if height > 0 else "unknown height"
        return f"The tallest building in this area is {name} ({height_str})."
    elif intent == "biggest":
        area_str = f"{area:.0f} m²" if area > 0 else "unknown size"
        return f"The building with the largest footprint is {name} ({area_str})."
    elif intent == "underdeveloped":
        return f"The most underdeveloped building (large footprint, low height) is {name}."
    else:
        return f"Found {name} matching your query."


@router.get("/search")
async def search(
    q: str = Query(..., description="Search query"),
    south: float = Query(..., description="South boundary (latitude)"),
    west: float = Query(..., description="West boundary (longitude)"),
    north: float = Query(..., description="North boundary (latitude)"),
    east: float = Query(..., description="East boundary (longitude)"),
):
    """Search for buildings in a bounding box."""
    try:
        # Parse intent
        intent = parse_query_intent(q)
        
        # Limit bounding box size to avoid timeouts (roughly 1km x 1km max)
        # This is a simple heuristic - could be improved
        max_bbox_size = 0.01  # ~1km
        lat_diff = north - south
        lng_diff = east - west
        
        if lat_diff > max_bbox_size or lng_diff > max_bbox_size:
            # Clamp to center area if bbox is too large
            lat_center = (south + north) / 2
            lng_center = (west + east) / 2
            half_size = max_bbox_size / 2
            south = lat_center - half_size
            north = lat_center + half_size
            west = lng_center - half_size
            east = lng_center + half_size
        
        # Query Overpass API for buildings in bbox
        # Use geom query to get coordinates directly
        overpass_query = f"""
        [out:json][timeout:15];
        (
          way["building"]({south},{west},{north},{east});
        );
        out geom;
        """
        
        # Try multiple Overpass API endpoints
        endpoints = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://z.overpass-api.de/api/interpreter",
        ]
        
        data = None
        last_error = None
        
        for endpoint in endpoints:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        endpoint,
                        data={"data": overpass_query},
                        timeout=aiohttp.ClientTimeout(total=20)
                    ) as response:
                        response.raise_for_status()
                        data = await response.json()
                        break  # Success, exit loop
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                last_error = e
                continue  # Try next endpoint
        
        if data is None:
            raise HTTPException(
                status_code=503,
                detail=f"All Overpass API endpoints failed. Last error: {str(last_error)}. The area might be too large or the servers are overloaded. Try zooming in more."
            )
        
        # Extract building ways and convert to GeoJSON
        elements = data.get("elements", [])
        buildings = []
        
        for elem in elements:
            if elem.get("type") == "way" and "geometry" in elem:
                geometry = elem.get("geometry", [])
                if len(geometry) < 3:
                    continue
                
                # Convert to polygon coordinates
                coords = [[p["lon"], p["lat"]] for p in geometry]
                if len(coords) < 3:
                    continue
                
                # Close polygon if not already closed
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                
                building_feature = {
                    "type": "Feature",
                    "id": elem.get("id"),
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [coords]
                    },
                    "properties": elem.get("tags", {})
                }
                buildings.append(building_feature)
        
        if not buildings:
            return {
                "intent": intent,
                "answer": "No buildings found in this area.",
                "target": None,
                "targetCenter": None,
                "candidates": []
            }
        
        # Rank buildings
        ranked = rank_buildings(buildings, intent)
        
        # Get target (top result)
        target = ranked[0] if ranked else None
        candidates = ranked[1:6] if len(ranked) > 1 else []  # Top 5 candidates
        
        if not target:
            return {
                "intent": intent,
                "answer": "No suitable buildings found.",
                "target": None,
                "targetCenter": None,
                "candidates": []
            }
        
        # Generate answer
        answer = generate_answer(q, intent, target)
        target_center = get_building_center(target)
        
        return {
            "intent": intent,
            "answer": answer,
            "target": target,
            "targetCenter": target_center,
            "candidates": candidates
        }
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        # This shouldn't happen since we handle errors above, but just in case
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")
