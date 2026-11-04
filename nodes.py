"""ComfyUI node: one selected reference, five consistent bilingual outputs."""
import torch
from .catalog import reference, image_path, image_array, fingerprint


class CinematicGallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "reference_id": ("STRING", {"default": "camera_arri", "multiline": False,
                "tooltip": "从电影参考图库选择 / Select a cinematic reference from the gallery"}),
            "language": (["zh", "en"], {"default": "zh",
                "tooltip": "界面语言；始终输出中英双语 / UI language; both text languages are always output"}),
        }}

    RETURN_TYPES = ("STRING", "STRING", "IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("prompt_zh", "prompt_en", "image", "description_zh", "description_en")
    FUNCTION = "load_reference"
    CATEGORY = "image/Cinematic Gallery"
    DESCRIPTION = "单选电影参考图库，返回原图、中英文提示词与说明。Select one reference to output its image, bilingual prompts and descriptions."

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
