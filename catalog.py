"""Offline, indexed access to the bundled cinematic references."""
from functools import lru_cache
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
import numpy as np

ROOT = Path(__file__).resolve().parent
LIBRARY = ROOT / "library"
TEXT_FIELDS = ("name_zh", "name_en", "prompt_zh", "prompt_en", "description_zh", "description_en")


@lru_cache(maxsize=1)
def catalog():
    payload = json.loads((LIBRARY / "catalog.json").read_text(encoding="utf-8"))
    categories = {row["id"] for row in payload["categories"]}
    seen = set()
    for row in payload["records"]:
        if row["id"] in seen or row["category"] not in categories:
            raise ValueError(f"Invalid cinematic catalog record: {row['id']}")
        if not all(isinstance(row.get(key), str) and row[key].strip() for key in TEXT_FIELDS):
            raise ValueError(f"Missing bilingual metadata: {row['id']}")
        if row["image"] != row["id"] + ".jpg" or Path(row["image"]).name != row["image"]:
            raise ValueError(f"Invalid cinematic image filename: {row['id']}")
        seen.add(row["id"])
    return payload


def reference(reference_id):
    if not isinstance(reference_id, str):
        raise ValueError("参考编号必须为字符串 / Reference ID must be a string")
    for row in catalog()["records"]:
        if row["id"] == reference_id:
            return row
    raise ValueError(f"无效的电影参考编号 / Unknown cinematic reference: {reference_id}")


def image_path(reference_id):
    row = reference(reference_id)
    directory = LIBRARY / "images"
    path = directory / row["image"]
    if directory.is_symlink() or path.is_symlink() or path.resolve().parent != directory.resolve():
        raise ValueError(f"拒绝越界或链接图片 / Unsafe image path: {reference_id}")
    if not path.is_file():
        raise FileNotFoundError(f"参考图缺失 / Missing reference image: library/images/{row['image']}")
    return path


def image_array(reference_id):
    path = image_path(reference_id)
    try:
        with Image.open(path) as source:
            return np.array(ImageOps.exif_transpose(source).convert("RGB"), dtype=np.float32) / 255.0
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError(f"参考图损坏 / Cannot decode reference image: {path.name}") from exc


def fingerprint(reference_id):
    row = reference(reference_id)
    value = hashlib.sha256(image_path(reference_id).read_bytes())
    value.update(json.dumps(row, ensure_ascii=False, sort_keys=True).encode("utf-8"))
    return value.hexdigest()


def browser_catalog():
    payload = catalog()
    records = []
    for row in payload["records"]:
        try:
            image_path(row["id"])
            available = True
        except (OSError, ValueError):
            available = False
        records.append({**row, "available": available})
    return {"version": payload["version"], "categories": payload["categories"], "records": records}
