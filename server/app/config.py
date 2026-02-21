import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    fal_key: str = ""

    host: str = "0.0.0.0"
    port: int = int(os.environ.get("PORT", 8000))
    debug: bool = False

    redis_url: str = ""

    output_dir: Path = Path("outputs")
    cache_dir: Path = Path("cache")

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://arcki.tech",
        "https://www.arcki.tech",
    ]

    default_texture_size: int = 1024
    default_mesh_simplify: float = 0.95

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def init_directories() -> None:
    settings = get_settings()
    settings.output_dir.mkdir(exist_ok=True)
    settings.cache_dir.mkdir(exist_ok=True)
