"""Cinematic Gallery: a standalone offline ComfyUI reference gallery."""
from .nodes import CinematicGallery, CinematicMotionGallery
from . import routes as _routes

NODE_CLASS_MAPPINGS = {"CinematicGallery": CinematicGallery, "CinematicMotionGallery": CinematicMotionGallery}
NODE_DISPLAY_NAME_MAPPINGS = {"CinematicGallery": "摄影参考",
                            "CinematicMotionGallery": "电影参考"}
WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
