from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
import aiohttp
import asyncio
import math

from ..services import OpenAIService, GeocodingService, calculate_zoom_for_location_type

router = APIRouter()


class SearchRequest(BaseModel):
    """Request body for agentic search."""
    query: str
    current_bounds: Optional[dict] = None  # {south, west, north, east}
    current_center: Optional[list[float]] = None  # [lng, lat]


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


def rank_buildings(features: list, building_attributes: Optional[dict]) -> list:
    """Rank buildings based on attributes."""
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

    # Determine sort criteria
    sort_by = building_attributes.get("sort_by") if building_attributes else None

    # Rank based on sort_by
    if sort_by == "height":
        buildings_with_features.sort(key=lambda x: x["height"], reverse=True)
    elif sort_by == "area":
        buildings_with_features.sort(key=lambda x: x["area"], reverse=True)
    elif sort_by == "underdeveloped":
        # Big footprint, low height = underdeveloped
        buildings_with_features.sort(
            key=lambda x: x["area"] / max(x["height"], 3),
            reverse=True
        )
    else:
        # Default: sort by area
        buildings_with_features.sort(key=lambda x: x["area"], reverse=True)

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


def expand_bbox_from_center(center: list, radius_km: float) -> dict:
    """Create a bounding box from center point and radius in km."""
    # Rough conversion: 1 degree latitude ~ 111km
    lat_offset = radius_km / 111.0
    # Longitude varies by latitude, roughly cos(lat) * 111km
    lng_offset = radius_km / (111.0 * math.cos(math.radians(center[1])))

    return {
        "south": center[1] - lat_offset,
        "north": center[1] + lat_offset,
        "west": center[0] - lng_offset,
        "east": center[0] + lng_offset
    }


async def fetch_buildings_in_bbox(bbox: dict, include_towers: bool = False) -> list:
    """Fetch buildings from Overpass API within bounding box.

    Args:
        bbox: Bounding box with south, west, north, east
        include_towers: If True, also query for towers and tall structures
    """
    south = bbox["south"]
    west = bbox["west"]
    north = bbox["north"]
    east = bbox["east"]

    # Limit bounding box size to avoid timeouts (roughly 1km x 1km max)
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
    # Include towers and tall structures if searching for height
    if include_towers:
        overpass_query = f"""
        [out:json][timeout:15];
        (
          way["building"]({south},{west},{north},{east});
          way["man_made"="tower"]({south},{west},{north},{east});
          way["man_made"="mast"]({south},{west},{north},{east});
          way["tourism"="attraction"]["height"]({south},{west},{north},{east});
          node["man_made"="tower"]({south},{west},{north},{east});
          node["tourism"="attraction"]["height"]({south},{west},{north},{east});
        );
        out geom;
        """
    else:
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
        return []

    # Extract building ways and nodes, convert to GeoJSON
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
        elif elem.get("type") == "node" and "lat" in elem and "lon" in elem:
            # Handle point features (like towers represented as nodes)
            # Create a small polygon around the point for consistent handling
            lat, lon = elem["lat"], elem["lon"]
            offset = 0.0001  # ~10m offset to create a small square
            coords = [
                [lon - offset, lat - offset],
                [lon + offset, lat - offset],
                [lon + offset, lat + offset],
                [lon - offset, lat + offset],
                [lon - offset, lat - offset]
            ]
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

    return buildings


@router.post("/search")
async def agentic_search(request: SearchRequest):
    """
    Agentic search endpoint that uses LLM to parse intent and geocoding for global search.

    Supports:
    - Navigation: "take me to Paris", "go to Empire State Building"
    - Building search: "tallest building", "biggest footprint near Central Park"
    - Area exploration: "what buildings are here"
    """
    try:
        openai_svc = OpenAIService()
        geocoding_svc = GeocodingService()

        # Step 1: Parse intent with LLM
        intent = await openai_svc.parse_search_intent(request.query)
        action = intent.get("action", "search_area")

        # Step 2: Route based on action
        if action == "navigate":
            # Pure navigation - geocode and return coordinates
            location_query = intent.get("location_query")
            if not location_query:
                return {
                    "intent": intent,
                    "answer": "I couldn't determine where you want to go. Please be more specific.",
                    "coordinates": None,
                    "target": None,
                    "candidates": [],
                    "should_fly_to": False,
                    "zoom_level": None
                }

            location = await geocoding_svc.geocode(location_query)
            if not location:
                return {
                    "intent": intent,
                    "answer": f"I couldn't find '{location_query}'. Please try a different location.",
                    "coordinates": None,
                    "target": None,
                    "candidates": [],
                    "should_fly_to": False,
                    "zoom_level": None
                }

            zoom_level = calculate_zoom_for_location_type(location.location_type)

            return {
                "intent": intent,
                "answer": f"Flying to {location.display_name}",
                "coordinates": [location.lon, location.lat],
                "target": None,
                "candidates": [],
                "should_fly_to": True,
                "zoom_level": zoom_level
            }

        elif action == "find_building":
            # Determine search area
            location_query = intent.get("location_query")
            search_center = None
            bbox = None
            location_name = None
            building_attributes = intent.get("building_attributes")
            sort_by = building_attributes.get("sort_by") if building_attributes else None

            # For "tallest building in X" queries, first check for famous landmarks
            if location_query and sort_by == "height":
                # Try to find famous landmarks like "tallest building Toronto" -> "CN Tower Toronto"
                landmark_query = f"tallest building {location_query}"
                landmark = await geocoding_svc.geocode(landmark_query)

                # Also try the original location
                location = await geocoding_svc.geocode(location_query)

                # If we found a landmark with high specificity, it might be THE tallest
                if landmark and landmark.location_type in ["poi", "place"]:
                    # Check if this is a famous tall structure
                    landmark_lower = landmark.display_name.lower()
                    tall_keywords = ["tower", "skyscraper", "building", "centre", "center"]
                    if any(kw in landmark_lower for kw in tall_keywords):
                        # This looks like a landmark - navigate directly to it
                        zoom_level = calculate_zoom_for_location_type(landmark.location_type)
                        return {
                            "intent": intent,
                            "answer": f"Flying to {landmark.display_name}",
                            "coordinates": [landmark.lon, landmark.lat],
                            "target": None,
                            "candidates": [],
                            "should_fly_to": True,
                            "zoom_level": zoom_level or 17
                        }

                # Use the location for area search
                if location:
                    search_center = [location.lon, location.lat]
                    location_name = location.display_name
                    radius = intent.get("search_radius_km") or 2.0  # Larger radius for city searches
                    bbox = expand_bbox_from_center(search_center, radius)
            elif location_query:
                # Geocode the location
                location = await geocoding_svc.geocode(location_query)
                if location:
                    search_center = [location.lon, location.lat]
                    location_name = location.display_name
                    radius = intent.get("search_radius_km") or 1.0
                    bbox = expand_bbox_from_center(search_center, radius)

            if not bbox and request.current_bounds:
                # Use current viewport
                bbox = request.current_bounds
                if request.current_center:
                    search_center = request.current_center

            if not bbox:
                return {
                    "intent": intent,
                    "answer": "I need a location or visible map area to search buildings.",
                    "coordinates": None,
                    "target": None,
                    "candidates": [],
                    "should_fly_to": False,
                    "zoom_level": None
                }

            # Fetch buildings from Overpass
            # Include towers when searching by height
            include_towers = sort_by == "height"
            buildings = await fetch_buildings_in_bbox(bbox, include_towers=include_towers)

            if not buildings:
                answer = await openai_svc.generate_search_answer(
                    query=request.query,
                    top_result=None,
                    location_name=location_name,
                    intent=intent
                )
                return {
                    "intent": intent,
                    "answer": answer,
                    "coordinates": search_center,
                    "target": None,
                    "candidates": [],
                    "should_fly_to": bool(search_center),
                    "zoom_level": 15 if search_center else None
                }

            # Rank buildings
            ranked = rank_buildings(buildings, building_attributes)

            # Get target and candidates
            target = ranked[0] if ranked else None
            limit = building_attributes.get("limit", 5) if building_attributes else 5
            candidates = ranked[1:limit] if len(ranked) > 1 else []

            # Generate answer with LLM
            answer = await openai_svc.generate_search_answer(
                query=request.query,
                top_result=target,
                location_name=location_name,
                intent=intent
            )

            target_center = get_building_center(target) if target else search_center

            return {
                "intent": intent,
                "answer": answer,
                "coordinates": target_center,
                "target": target,
                "candidates": candidates,
                "should_fly_to": True,
                "zoom_level": 17
            }

        else:
            # search_area - general exploration
            if not request.current_bounds:
                return {
                    "intent": intent,
                    "answer": "I need a visible map area to explore buildings.",
                    "coordinates": None,
                    "target": None,
                    "candidates": [],
                    "should_fly_to": False,
                    "zoom_level": None
                }

            buildings = await fetch_buildings_in_bbox(request.current_bounds)

            if not buildings:
                return {
                    "intent": intent,
                    "answer": "No buildings found in this area.",
                    "coordinates": request.current_center,
                    "target": None,
                    "candidates": [],
                    "should_fly_to": False,
                    "zoom_level": None
                }

            # Return top buildings by area
            ranked = rank_buildings(buildings, {"sort_by": "area"})
            target = ranked[0] if ranked else None
            candidates = ranked[1:6] if len(ranked) > 1 else []

            return {
                "intent": intent,
                "answer": f"Found {len(buildings)} buildings in this area.",
                "coordinates": get_building_center(target) if target else request.current_center,
                "target": target,
                "candidates": candidates,
                "should_fly_to": False,
                "zoom_level": None
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


# Keep the old GET endpoint for backwards compatibility during migration
@router.get("/search")
async def search_get(
    q: str = Query(..., description="Search query"),
    south: float = Query(..., description="South boundary (latitude)"),
    west: float = Query(..., description="West boundary (longitude)"),
    north: float = Query(..., description="North boundary (latitude)"),
    east: float = Query(..., description="East boundary (longitude)"),
):
    """Legacy GET endpoint - redirects to new POST endpoint."""
    request = SearchRequest(
        query=q,
        current_bounds={"south": south, "west": west, "north": north, "east": east},
        current_center=[(west + east) / 2, (south + north) / 2]
    )
    return await agentic_search(request)
