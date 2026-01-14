import json
import asyncio
from typing import Optional, Literal, cast
import openai

from ..config import get_settings
from ..schemas import PromptCleanResponse, ImageGenerateResponse


class OpenAIService:
    """Service for OpenAI API interactions."""

    SEARCH_INTENT_PROMPT = """You are an intelligent map search assistant. Parse user queries to understand their intent.

Analyze the query and extract:
1. **action**: One of:
   - "navigate" - User wants to go to a specific named location OR a famous landmark/structure (e.g., "take me to Paris", "go to Empire State Building", "tallest building in Toronto")
   - "find_building" - User wants to find a building by characteristics in the current view (e.g., "tallest building here", "biggest footprint")
   - "search_area" - User wants to explore an area (e.g., "what buildings are here")

IMPORTANT: If the user asks for the "tallest building in [city]" or similar,
and that city has a famous iconic tall structure (like CN Tower in Toronto,
Burj Khalifa in Dubai, Empire State Building in NYC, Eiffel Tower in Paris, etc.),
use "navigate" action with the landmark name as location_query.

2. **location_query**: The location mentioned (city, landmark, address, neighborhood)
   - For famous landmarks, include the landmark name: "CN Tower, Toronto", "Burj Khalifa, Dubai"
   - Extract exact location names: "Central Park", "Tokyo", "Empire State Building"
   - If relative ("near here", "in this area", "around me"), set to null

3. **building_attributes**: For building searches (not navigation), extract:
   - sort_by: "height" (tallest), "area" (biggest footprint), "underdeveloped" (large footprint + low height), or null
   - building_type: "commercial", "residential", "any" (default: "any")
   - limit: number of results wanted (default: 5)

4. **search_radius_km**: If proximity search mentioned ("within 2km", "nearby" = 1km)

Respond in JSON format:
{
    "action": "navigate|find_building|search_area",
    "location_query": "string or null",
    "building_attributes": {"sort_by": "height|area|underdeveloped|null", "building_type": "any", "limit": 5},
    "search_radius_km": number or null,
    "reasoning": "Brief explanation of your interpretation"
}

Examples:
- "take me to the Eiffel Tower" -> {"action": "navigate", "location_query": "Eiffel Tower, Paris", "building_attributes": null, "search_radius_km": null, "reasoning": "Direct navigation to landmark"}
- "find the tallest building" -> {"action": "find_building", "location_query": null, "building_attributes": {"sort_by": "height", "building_type": "any", "limit": 5}, "search_radius_km": null, "reasoning": "Find tallest in current view"}
- "tallest building in Toronto" -> {"action": "navigate", "location_query": "CN Tower, Toronto",
  "building_attributes": null, "search_radius_km": null,
  "reasoning": "CN Tower is the tallest structure in Toronto"}
- "tallest building in Dubai" -> {"action": "navigate", "location_query": "Burj Khalifa, Dubai",
  "building_attributes": null, "search_radius_km": null,
  "reasoning": "Burj Khalifa is the tallest building in Dubai"}
- "tallest building near Central Park" -> {"action": "find_building",
  "location_query": "Central Park, New York",
  "building_attributes": {"sort_by": "height", "building_type": "any", "limit": 5},
  "search_radius_km": 1, "reasoning": "Find tallest building near Central Park"}
- "take me to underdeveloped building" -> {"action": "find_building",
  "location_query": null,
  "building_attributes": {"sort_by": "underdeveloped", "building_type": "any", "limit": 5},
  "search_radius_km": null, "reasoning": "Find underdeveloped buildings in current view"}
- "go to san francisco" -> {"action": "navigate", "location_query": "San Francisco", "building_attributes": null, "search_radius_km": null, "reasoning": "Navigate to city"}"""

    ANSWER_GENERATION_PROMPT = """You are a helpful map assistant. Generate a brief, informative response about the search result.

Be concise (1-2 sentences max). Include key facts when available:
- Building name if known
- Height or size if relevant to the query
- Location context

If no results were found, provide a helpful message."""

    STYLE_CONTEXTS = {
        "architectural": "2D flat line art blueprint with bold colored outlines, no 3D, no fill",
        "modern": "2D flat line art with bold colored outlines, minimalist modern, no 3D, no fill",
        "classical": "2D flat line art with bold colored outlines, classical details, no 3D, no fill",
        "futuristic": "2D flat line art with bold colored outlines, sleek futuristic, no 3D, no fill",
    }

    SYSTEM_PROMPT = """You create 2D FLAT LINE ART prompts for DALL-E. NEVER 3D renders.

CRITICAL RULES - MUST FOLLOW:
- 2D FLAT LINE ART ONLY - like a blueprint or technical drawing
- ABSOLUTELY NO 3D RENDERING - flat 2D illustration only
- ABSOLUTELY NO FILLED COLORS - only outline strokes
- ABSOLUTELY NO REALISTIC MATERIALS OR TEXTURES
- Just bold colored LINE STROKES on pure white background
- Like an architect's line drawing but with colorful lines instead of black
- Think: vector illustration, blueprint style, technical drawing
- Lines should be clean, bold, and in vibrant colors (purple, blue, pink, teal)
- Pure white background - nothing else
- NO TEXT or words in the image
- 2D ONLY - NOT 3D

Example: "2D flat line art blueprint of a [building],
only colored outline strokes, no fill, no 3D, no realistic rendering,
purple and blue line strokes on white background, technical drawing style,
vector illustration"

Respond in JSON:
{
    "cleaned_prompt": "Simple description",
    "dalle_prompt": "2D flat line art, blueprint style, only colored outline strokes, "
                    "no fill, no 3D rendering, no realistic textures, "
                    "colored lines on white background, technical drawing",
    "style_tags": ["2D line art", "blueprint", "colored outlines", "flat illustration", "no 3D"]
}"""

    SYSTEM_PROMPT_3D_PREVIEW = """You are an expert at creating prompts for 3D architectural visualization renders.
Your job is to take a user's description and create a prompt for a beautiful 3D PERSPECTIVE RENDER of the building.

CRITICAL RULES for the 3D preview prompt:
- Generate a BEAUTIFUL 3D PERSPECTIVE RENDER - like a professional architectural visualization
- Show the building from a dramatic 3/4 angle view
- Use REALISTIC MATERIALS and COLORS - real building materials like glass, steel, brick, concrete
- Include SOFT NATURAL LIGHTING - golden hour or soft daylight
- Add SUBTLE SHADOWS for depth and realism
- Show the building in a MINIMAL CONTEXT - simple ground plane, maybe subtle sky gradient
- Make it look PHOTOREALISTIC and PROFESSIONAL
- This is for USER PREVIEW ONLY - to help them visualize the final 3D model

Example format: "Professional 3D architectural render of a [building],
dramatic 3/4 perspective view, photorealistic materials, soft golden hour lighting,
subtle shadows, minimal environment, architectural visualization quality"

Respond in JSON format:
{
    "preview_prompt": "3D perspective render prompt following the rules above"
}"""

    def __init__(self):
        settings = get_settings()
        if not settings.openai_api_key:
            self._client = None
        else:
            self._client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    @property
    def is_configured(self) -> bool:
        """Check if OpenAI is configured."""
        return self._client is not None

    async def clean_prompt(
        self,
        prompt: str,
        style: str = "architectural"
    ) -> PromptCleanResponse:
        """
        Clean and enhance a user prompt for DALL-E.

        Args:
            prompt: User's raw prompt
            style: Architecture style preference

        Returns:
            PromptCleanResponse with cleaned and optimized prompts
        """
        if not self._client:
            raise RuntimeError("OpenAI not configured. Set OPENAI_API_KEY.")

        style_context = self.STYLE_CONTEXTS.get(style, self.STYLE_CONTEXTS["architectural"])

        response = await self._client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": f"Style preference: {style_context}\n\nUser prompt: {prompt}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.3,  # Lower temperature for consistent bright outputs
            max_tokens=500
        )

        content = response.choices[0].message.content
        if content is None:
            raise RuntimeError("No content in OpenAI response")
        result = json.loads(content)

        return PromptCleanResponse(
            original_prompt=prompt,
            cleaned_prompt=result.get("cleaned_prompt", prompt),
            dalle_prompt=result.get("dalle_prompt", prompt),
            style_tags=result.get("style_tags", [])
        )

    async def generate_images(
        self,
        prompt: str,
        num_images: int = 1,
        size: str = "1024x1024",
        quality: str = "hd",
        style: str = "natural",  # Natural works better for clean line art
        include_3d_preview: bool = True
    ) -> ImageGenerateResponse:
        """
        Generate architectural images with DALL-E 3.

        Args:
            prompt: Optimized DALL-E prompt
            num_images: Number of views to generate (1-4)
            size: Image size
            quality: standard or hd
            style: natural or vivid
            include_3d_preview: Whether to also generate a 3D preview render

        Returns:
            ImageGenerateResponse with image URLs and optional 3D preview
        """
        if not self._client:
            raise RuntimeError("OpenAI not configured. Set OPENAI_API_KEY.")

        # 2D flat line art - blueprint style with colored outlines only, NO 3D rendering
        line_prefix = (
            "2D flat line art, blueprint technical drawing style, "
            "ONLY colored outline strokes, NO fill colors, NO 3D rendering, "
            "NO realistic textures, bold purple blue and teal colored lines "
            "on pure white background, vector illustration style, "
        )
        line_prompt = f"{line_prefix}{prompt}"

        # Specific views: front, side, top, isometric - all 2D flat
        view_prompts = [
            f"{line_prompt}, front elevation 2D blueprint",
            f"{line_prefix}{prompt}, side elevation 2D blueprint",
            f"{line_prefix}{prompt}, top down 2D floor plan style",
            f"{line_prefix}{prompt}, isometric 2D technical drawing"
        ][:num_images]

        # Generate all images in parallel instead of sequentially
        async def generate_single_image(view_prompt: str):
            # Cast size and quality to satisfy OpenAI API type requirements
            size_param = cast(
                Literal["1024x1024", "1792x1024", "1024x1792"],
                size
            )
            quality_param = cast(Literal["standard", "hd"], quality)
            style_param = cast(Literal["natural", "vivid"], style)

            if not self._client:
                raise RuntimeError("OpenAI client not configured")
            response = await self._client.images.generate(
                model="dall-e-3",
                prompt=view_prompt,
                size=size_param,
                quality=quality_param,
                style=style_param,
                n=1
            )
            return response.data[0].url

        # Run all image generations concurrently
        image_results = await asyncio.gather(
            *[generate_single_image(p) for p in view_prompts]
        )
        # Type assertion: we know all URLs are strings
        images: list[str] = cast(list[str], list(image_results))

        # Generate 3D preview image (separate from the flat elevation images)
        preview_3d_url: Optional[str] = None
        if include_3d_preview:
            preview_3d_url = await self._generate_3d_preview(prompt, size, quality)

        return ImageGenerateResponse(
            images=images,
            prompt_used=prompt,
            preview_3d_url=preview_3d_url
        )

    async def _generate_3d_preview(
        self,
        prompt: str,
        size: str = "1024x1024",
        quality: str = "hd"
    ) -> Optional[str]:
        """
        Generate a 3D perspective preview render for user visualization.
        This is NOT used for Trellis 3D generation - just for user preview.

        Args:
            prompt: Building description
            size: Image size
            quality: standard or hd

        Returns:
            URL to the 3D preview image
        """
        if not self._client:
            raise RuntimeError("OpenAI not configured. Set OPENAI_API_KEY.")

        try:
            # Get optimized 3D preview prompt from GPT
            gpt_response = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT_3D_PREVIEW},
                    {"role": "user", "content": f"Create a 3D preview prompt for: {prompt}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.5,
                max_tokens=300
            )

            content = gpt_response.choices[0].message.content
            if content is None:
                raise RuntimeError("No content in OpenAI response")
            result = json.loads(content)
            default_preview = (
                f"Professional 3D architectural render of {prompt}, "
                "dramatic perspective view, photorealistic"
            )
            preview_prompt = result.get("preview_prompt", default_preview)

            # Generate the 3D preview image
            size_param = cast(
                Literal["1024x1024", "1792x1024", "1024x1792"],
                size
            )
            quality_param = cast(Literal["standard", "hd"], quality)
            response = await self._client.images.generate(
                model="dall-e-3",
                prompt=preview_prompt,
                size=size_param,
                quality=quality_param,
                style="vivid",  # Use vivid for more dramatic 3D renders
                n=1
            )
            return response.data[0].url
        except Exception as e:
            print(f"Failed to generate 3D preview: {e}")
            return None

    async def parse_search_intent(self, query: str) -> dict:
        """
        Parse a natural language search query into structured intent.

        Args:
            query: User's search query (e.g., "take me to Paris", "tallest building")

        Returns:
            Dict with action, location_query, building_attributes, search_radius_km
        """
        if not self._client:
            # Fallback to simple keyword parsing if OpenAI not configured
            return self._fallback_intent_parse(query)

        try:
            response = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self.SEARCH_INTENT_PROMPT},
                    {"role": "user", "content": f"Parse this search query: {query}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.3,  # Lower for more deterministic parsing
                max_tokens=300
            )

            content = response.choices[0].message.content
            if content is None:
                raise RuntimeError("No content in OpenAI response")
            return json.loads(content)
        except Exception as e:
            print(f"OpenAI intent parsing error: {e}")
            return self._fallback_intent_parse(query)

    def _fallback_intent_parse(self, query: str) -> dict:
        """Fallback rule-based intent parsing when OpenAI is unavailable."""
        query_lower = query.lower()

        # Check for navigation intent
        if any(phrase in query_lower for phrase in ["take me to", "go to", "navigate to", "fly to"]):
            # Extract location after the phrase
            for phrase in ["take me to", "go to", "navigate to", "fly to"]:
                if phrase in query_lower:
                    location = query_lower.split(phrase, 1)[1].strip()
                    # Check if it's a building search
                    if any(word in location for word in ["tallest", "biggest", "underdeveloped"]):
                        break  # It's a building search, not navigation
                    return {
                        "action": "navigate",
                        "location_query": location,
                        "building_attributes": None,
                        "search_radius_km": None,
                        "reasoning": "Fallback: navigation phrase detected"
                    }

        # Check for building search
        sort_by = None
        if any(word in query_lower for word in ["tallest", "tall", "highest", "height"]):
            sort_by = "height"
        elif any(word in query_lower for word in ["biggest", "largest", "footprint", "area"]):
            sort_by = "area"
        elif any(word in query_lower for word in ["underdeveloped", "low-rise", "short building"]):
            sort_by = "underdeveloped"

        if sort_by:
            return {
                "action": "find_building",
                "location_query": None,
                "building_attributes": {"sort_by": sort_by, "building_type": "any", "limit": 5},
                "search_radius_km": None,
                "reasoning": f"Fallback: building search for {sort_by}"
            }

        # Default to search area
        return {
            "action": "search_area",
            "location_query": None,
            "building_attributes": None,
            "search_radius_km": None,
            "reasoning": "Fallback: no specific intent detected"
        }

    async def generate_search_answer(
        self,
        query: str,
        top_result: Optional[dict],
        location_name: Optional[str],
        intent: Optional[dict] = None
    ) -> str:
        """
        Generate a natural language answer for search results.

        Args:
            query: Original search query
            top_result: Top building result (GeoJSON feature) or None
            location_name: Location context if applicable
            intent: Parsed intent for context

        Returns:
            Natural language answer string
        """
        if not self._client:
            return self._fallback_answer_generation(query, top_result, location_name, intent)

        try:
            if not top_result:
                context = f"Query: {query}\nLocation: {location_name or 'current viewport'}\nResult: No buildings found."
            else:
                props = top_result.get("properties", {})
                context = f"""Query: {query}
Location: {location_name or 'current viewport'}
Top result properties: {json.dumps(props, indent=2)}
Intent: {json.dumps(intent) if intent else 'unknown'}"""

            response = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self.ANSWER_GENERATION_PROMPT},
                    {"role": "user", "content": context}
                ],
                temperature=0.7,
                max_tokens=100
            )

            content = response.choices[0].message.content
            return content if content is not None else ""
        except Exception as e:
            print(f"OpenAI answer generation error: {e}")
            return self._fallback_answer_generation(query, top_result, location_name, intent)

    def _fallback_answer_generation(
        self,
        _: str,
        top_result: Optional[dict],
        location_name: Optional[str],
        intent: Optional[dict]
    ) -> str:
        """Fallback answer generation when OpenAI is unavailable."""
        if not top_result:
            return f"No buildings found{' near ' + location_name if location_name else ' in this area'}."

        props = top_result.get("properties", {})
        name = props.get("name") or props.get("addr:housename") or props.get("addr:housenumber") or "this building"

        sort_by = intent.get("building_attributes", {}).get("sort_by") if intent else None

        if sort_by == "height":
            height = props.get("height", props.get("building:levels", "unknown"))
            return f"The tallest building is {name} ({height})."
        elif sort_by == "area":
            return f"The building with the largest footprint is {name}."
        elif sort_by == "underdeveloped":
            return f"The most underdeveloped building (large footprint, low height) is {name}."
        else:
            return f"Found {name} matching your query."
