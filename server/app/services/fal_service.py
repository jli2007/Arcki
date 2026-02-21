import os
import time
import uuid
import asyncio
from pathlib import Path

import aiohttp
import fal_client

from ..config import get_settings
from ..schemas import TrellisResponse


class FalService:
    TRELLIS_SINGLE = "fal-ai/trellis"
    TRELLIS_MULTI = "fal-ai/trellis/multi"

    def __init__(self):
        settings = get_settings()
        self._configured = bool(settings.fal_key)
        if self._configured:
            os.environ["FAL_KEY"] = settings.fal_key

    @property
    def is_configured(self) -> bool:
        return self._configured

    async def upload_image(self, image_data: bytes, filename: str) -> str:
        settings = get_settings()
        local_path = settings.cache_dir / filename
        local_path.write_bytes(image_data)

        url = await asyncio.to_thread(fal_client.upload_file, str(local_path))
        return url

    async def generate_3d(
        self,
        image_url: str | None = None,
        image_urls: list[str] | None = None,
        use_multi: bool = False,
        seed: int | None = None,
        texture_size: int = 1024,
        mesh_simplify: float = 0.95,
        ss_guidance_strength: float = 7.5,
        slat_guidance_strength: float = 3.0,
    ) -> TrellisResponse:
        if not self._configured:
            raise RuntimeError("fal.ai not configured. Set FAL_KEY.")

        if not image_url and not image_urls:
            raise ValueError("Must provide image_url or image_urls")

        start_time = time.time()

        if use_multi and image_urls and len(image_urls) > 1:
            endpoint = self.TRELLIS_MULTI
            arguments = {
                "image_urls": image_urls,
                "multiimage_algo": "stochastic",
                "texture_size": texture_size,
                "mesh_simplify": mesh_simplify,
                "ss_guidance_strength": ss_guidance_strength,
                "slat_guidance_strength": slat_guidance_strength,
            }
        else:
            endpoint = self.TRELLIS_SINGLE
            arguments = {
                "image_url": image_url or (image_urls[0] if image_urls else None),
                "texture_size": texture_size,
                "mesh_simplify": mesh_simplify,
                "ss_guidance_strength": ss_guidance_strength,
                "slat_guidance_strength": slat_guidance_strength,
            }

        if seed is not None:
            arguments["seed"] = seed

        result = await asyncio.to_thread(
            fal_client.subscribe,
            endpoint,
            arguments=arguments,
            with_logs=True
        )

        generation_time = time.time() - start_time

        model_mesh = result.get("model_mesh", {})
        glb_url = model_mesh.get("url")
        file_name = f"{uuid.uuid4().hex[:8]}.glb"

        if not glb_url:
            raise RuntimeError("No GLB URL in Trellis response")

        settings = get_settings()
        output_path = settings.output_dir / file_name
        await self._download_file(glb_url, output_path)

        return TrellisResponse(
            model_url=glb_url,
            file_name=file_name,
            format="glb",
            generation_time=generation_time
        )

    async def _download_file(self, url: str, output_path: Path) -> None:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to download: {response.status}")
                content = await response.read()
                output_path.write_bytes(content)
