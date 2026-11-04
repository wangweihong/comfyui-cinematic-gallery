"""Offline photography and cinematic reference nodes."""
import torch
from .catalog import reference, image_path, image_array, fingerprint


class CinematicGallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "reference_id": ("STRING", {"default": "camera_arri", "multiline": False,
                "tooltip": "从摄影参考图库选择 / Select a photography reference from the gallery"}),
            "language": (["zh", "en"], {"default": "zh",
                "tooltip": "界面语言；始终输出中英双语 / UI language; both text languages are always output"}),
        }}

    RETURN_TYPES = ("STRING", "STRING", "IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("prompt_zh", "prompt_en", "image", "description_zh", "description_en")
    FUNCTION = "load_reference"
    CATEGORY = "image/Photography Reference"
    DESCRIPTION = "摄影参考图库，返回原图、中英文提示词与说明。"

    @classmethod
    def VALIDATE_INPUTS(cls, reference_id, language="zh"):
        try:
            image_path(reference_id)
            if language not in ("zh", "en"):
                return "无效的界面语言 / Invalid UI language"
        except (ValueError, OSError) as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, reference_id, language="zh"):
        return fingerprint(reference_id)

    def load_reference(self, reference_id, language="zh"):
        row = reference(reference_id)
        image = torch.from_numpy(image_array(reference_id))[None, ...]
        return row["prompt_zh"], row["prompt_en"], image, row["description_zh"], row["description_en"]


class CinematicMotionGallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "motion_id": ("STRING", {"default": "pan_right", "multiline": False,
                "tooltip": "从电影参考图库选择运镜或艺术风格"}),
            "language": (["zh", "en"], {"default": "zh", "tooltip": "界面语言 / UI language"}),
        }}

    RETURN_TYPES = ("STRING", "IMAGE", "STRING", "STRING", "VIDEO")
    RETURN_NAMES = ("prompt", "image", "description", "example_prompt", "video")
    FUNCTION = "load_motion"
    CATEGORY = "video/Cinematic Reference"
    DESCRIPTION = "电影参考：运镜或风格提示词、封面、说明、完整示例与视频。文本跟随所选语言。"

    @classmethod
    def VALIDATE_INPUTS(cls, motion_id, language="zh"):
        from . import cinematic_catalog
        try:
            cinematic_catalog.validate_assets(motion_id)
            if language not in ("zh", "en"):
                return "无效的界面语言 / Invalid UI language"
        except (OSError, ValueError) as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, motion_id, language="zh"):
        from .cinematic_catalog import fingerprint
        return fingerprint(motion_id) + ":" + language

    def load_motion(self, motion_id, language="zh"):
        from . import cinematic_catalog
        from comfy_api.latest import InputImpl
        if language not in ("zh", "en"):
            raise ValueError("无效的界面语言 / Invalid UI language")
        row = cinematic_catalog.reference(motion_id)
        _, video_path = cinematic_catalog.validate_assets(motion_id)
        poster = torch.from_numpy(cinematic_catalog.poster_array(motion_id))[None, ...]
        video = InputImpl.VideoFromFile(str(video_path))
        try:
            video.get_dimensions()
        except Exception as exc:
            raise ValueError(f"电影参考视频损坏 / Cannot read cinematic video: {video_path.name}") from exc
        return (row[f"prompt_{language}"], poster, cinematic_catalog.description(row, language),
                row[f"example_prompt_{language}"], video)
