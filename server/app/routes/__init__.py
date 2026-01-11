from .generation import router as generation_router
from .files import router as files_router
from .health import router as health_router
from .search import router as search_router

__all__ = ["generation_router", "files_router", "health_router", "search_router"]
