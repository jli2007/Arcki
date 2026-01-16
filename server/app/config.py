import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

# ============================================================================
# OLD VERSION (commented out for reference):
# This version had issues:
# 1. Environment variables would override .env file values (causing API key issues)
# 2. No handling for DEBUG=WARN (would fail validation)
# 3. Used nested Config class (pydantic-settings v1 style)
# ============================================================================
# import os
# from pathlib import Path
# from functools import lru_cache
# from pydantic_settings import BaseSettings
# 
# 
# class Settings(BaseSettings):
#     """Application settings loaded from environment variables."""
# 
#     # API Keys
#     openai_api_key: str = ""
#     fal_key: str = ""
# 
#     # Server
#     host: str = "0.0.0.0"
#     port: int = int(os.environ.get("PORT", 8000))
#     debug: bool = False
# 
#     # Redis (optional - falls back to in-memory if not set)
#     redis_url: str = ""
# 
#     # Directories
#     upload_dir: Path = Path("uploads")
#     output_dir: Path = Path("outputs")
#     cache_dir: Path = Path("cache")
# 
#     # CORS
#     cors_origins: list[str] = [
#         "http://localhost:3000",
#         "http://localhost:3001",
#         "https://arcki.tech",
#         "https://www.arcki.tech",
#     ]
# 
#     # Generation defaults - optimized for quality
#     default_texture_size: int = 1024 # Max resolution
#     default_mesh_simplify: float = 0.95  # 0.9 = max detail (minimum simplification)
# 
#     class Config:
#         env_file = ".env"
#         env_file_encoding = "utf-8"
# 
# 
# @lru_cache
# def get_settings() -> Settings:
#     """Get cached settings instance."""
#     return Settings()
# 
# 
# def init_directories() -> None:
#     """Create required directories."""
#     settings = get_settings()
#     settings.upload_dir.mkdir(exist_ok=True)
#     settings.output_dir.mkdir(exist_ok=True)
#     settings.cache_dir.mkdir(exist_ok=True)

# ============================================================================
# NEW VERSION: Fixes for .env file loading and DEBUG=WARN handling
# ============================================================================

# Load .env file FIRST and explicitly set environment variables
# This ensures .env file values take precedence over system environment variables
# Fixes issue where environment variables were overriding .env file values
# Try multiple paths in case the module is imported from different locations
_env_paths = [
    Path(__file__).parent.parent.parent / ".env",  # server/.env
    Path.cwd() / ".env",  # Current working directory
    Path(__file__).parent.parent / ".env",  # Fallback
]

_env_path = None
for path in _env_paths:
    if path.exists():
        _env_path = path
        break

if _env_path and _env_path.exists():
    # Read .env file directly and set environment variables explicitly
    with open(_env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                # Remove quotes if present
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                # Explicitly override environment variable with .env file value
                # CRITICAL: This must happen before Settings class reads env vars
                os.environ[key] = value


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # NEW: Using pydantic-settings v2 model_config instead of nested Config class
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"  # Ignore extra env vars that don't match fields
    )

    # API Keys
    openai_api_key: str = ""
    fal_key: str = ""

    # Server
    host: str = "0.0.0.0"
    port: int = int(os.environ.get("PORT", 8000))
    debug: bool = False

    # Redis (optional - falls back to in-memory if not set)
    redis_url: str = ""

    # Directories
    upload_dir: Path = Path("uploads")
    output_dir: Path = Path("outputs")
    cache_dir: Path = Path("cache")

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://arcki.tech",
        "https://www.arcki.tech",
    ]

    # Generation defaults - optimized for quality
    default_texture_size: int = 1024 # Max resolution
    default_mesh_simplify: float = 0.95  # 0.9 = max detail (minimum simplification)

    # NEW: Field validator to handle DEBUG=WARN gracefully
    # OLD VERSION: No validator - would fail validation when DEBUG=WARN was set
    # This caused Settings class to fail initialization, preventing API keys from loading
    @field_validator('debug', mode='before')
    @classmethod
    def parse_debug(cls, v):
        """Parse debug field, handling non-boolean values gracefully."""
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            # Only accept explicit boolean strings
            if v.lower() in ('true', '1', 'yes', 'on'):
                return True
            # For any other value (including 'WARN'), return False
            return False
        return False


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def init_directories() -> None:
    """Create required directories."""
    settings = get_settings()
    settings.upload_dir.mkdir(exist_ok=True)
    settings.output_dir.mkdir(exist_ok=True)
    settings.cache_dir.mkdir(exist_ok=True)
