"""Cinematic Gallery: a standalone offline ComfyUI reference gallery."""
from .nodes import CinematicGallery
from . import routes as _routes

NODE_CLASS_MAPPINGS = {"CinematicGallery": CinematicGallery}
NODE_DISPLAY_NAME_MAPPINGS = {"CinematicGallery": "Cinematic Gallery 电影参考图库"}
WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
