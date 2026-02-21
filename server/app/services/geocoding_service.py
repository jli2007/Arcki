import aiohttp
from typing import Optional
from dataclasses import dataclass


@dataclass
class GeocodingResult:
    lat: float
    lon: float
    display_name: str
    location_type: str
    bounding_box: Optional[list[float]] = None


def shorten_display_name(full_name: str, address_details: Optional[dict] = None) -> str:
    if not full_name:
        return full_name

    # If we have address details, construct a cleaner name
    if address_details:
        parts = []
        # Get the main name (landmark, building, etc.)
        for key in ["tourism", "building", "amenity", "man_made", "leisure", "shop"]:
            if key in address_details:
                parts.append(address_details[key])
                break

        # Add city/town
        for key in ["city", "town", "village", "municipality"]:
            if key in address_details:
                parts.append(address_details[key])
                break

        # Add country
        if "country" in address_details:
            parts.append(address_details["country"])

        if len(parts) >= 2:
            return ", ".join(parts)

    parts = [p.strip() for p in full_name.split(",")]
    if len(parts) <= 3:
        return full_name

    result_parts = [parts[0]]

    for part in parts[1:6]:
        if any(char.isdigit() for char in part):
            continue
        if part.lower() in ["ontario", "quebec", "british columbia", "alberta",
                           "golden horseshoe", "greater toronto area"]:
            continue
        result_parts.append(part)
        break

    if parts[-1].strip() not in result_parts:
        result_parts.append(parts[-1].strip())

    return ", ".join(result_parts)


class GeocodingService:
    NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
    NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
    USER_AGENT = "arcki/1.0"

    async def geocode(self, query: str) -> Optional[GeocodingResult]:
        params = {
            "q": query,
            "format": "json",
            "limit": 1,
            "addressdetails": 1,
        }

        headers = {
            "User-Agent": self.USER_AGENT,
        }

        try:
            # Disable SSL verification for development (macOS Python 3.14 SSL cert issue)
            import ssl
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(
                    self.NOMINATIM_URL,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    response.raise_for_status()
                    data = await response.json()

                    if not data:
                        return None

                    result = data[0]

                    bbox = None
                    if "boundingbox" in result:
                        bbox = [float(x) for x in result["boundingbox"]]

                    location_type = result.get("type", "unknown")
                    osm_class = result.get("class", "")
                    if osm_class == "boundary":
                        location_type = "city" if location_type == "administrative" else location_type
                    elif osm_class == "building":
                        location_type = "building"
                    elif osm_class == "amenity":
                        location_type = "landmark"
                    elif osm_class == "tourism":
                        location_type = "poi"
                    elif osm_class == "man_made":
                        location_type = "poi"
                    elif osm_class == "place":
                        location_type = "place"

                    full_display_name = result.get("display_name", query)
                    address = result.get("address", {})
                    short_name = shorten_display_name(full_display_name, address)

                    return GeocodingResult(
                        lat=float(result["lat"]),
                        lon=float(result["lon"]),
                        display_name=short_name,
                        location_type=location_type,
                        bounding_box=bbox
                    )

        except (aiohttp.ClientError, KeyError, ValueError) as e:
            print(f"Geocoding error: {e}")
            return None

    async def reverse_geocode(self, lat: float, lon: float) -> Optional[GeocodingResult]:
        params = {
            "lat": lat,
            "lon": lon,
            "format": "json",
        }

        headers = {
            "User-Agent": self.USER_AGENT,
        }

        try:
            import ssl
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(
                    self.NOMINATIM_REVERSE_URL,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    response.raise_for_status()
                    result = await response.json()

                    if "error" in result:
                        return None

                    return GeocodingResult(
                        lat=lat,
                        lon=lon,
                        display_name=result.get("display_name", "Unknown location"),
                        location_type=result.get("type", "unknown"),
                        bounding_box=None
                    )

        except (aiohttp.ClientError, KeyError, ValueError) as e:
            print(f"Reverse geocoding error: {e}")
            return None


def calculate_zoom_for_location_type(location_type: str) -> int:
    zoom_levels = {
        "city": 12,
        "administrative": 12,
        "town": 13,
        "village": 14,
        "neighbourhood": 15,
        "building": 17,
        "landmark": 16,
        "amenity": 16,
        "house": 18,
    }
    return zoom_levels.get(location_type, 15)
