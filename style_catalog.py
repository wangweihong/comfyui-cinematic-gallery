"""Bilingual fixed-scene art-style video references."""
from functools import lru_cache
import hashlib
import json
import numpy as np
from PIL import Image, ImageOps
from .catalog import ROOT

LIBRARY = ROOT / "library" / "styles"
FIELDS = ("name_zh", "name_en", "prompt_zh", "prompt_en", "example_prompt_zh", "example_prompt_en",
          "description_zh", "description_en", "use_cases_zh", "use_cases_en", "distinctions_zh", "distinctions_en")


@lru_cache(maxsize=1)
def catalog():
    payload = json.loads((LIBRARY / "catalog.json").read_text(encoding="utf-8"))
    categories = {row["id"] for row in payload["categories"]}
    seen = set()
    for row in payload["records"]:
        identifier = row["id"]
        if not isinstance(identifier, str) or not identifier.startswith("style_") or identifier in seen or row["category"] not in categories or not all(
            char in "abcdefghijklmnopqrstuvwxyz0123456789_" for char in identifier
        ) or not identifier:
            raise ValueError(f"Invalid cinematic style: {identifier}")
        if not all(isinstance(row.get(key), str) and row[key].strip() for key in FIELDS):
            raise ValueError(f"Incomplete bilingual style: {identifier}")
        if row["status"] not in ("pending", "ready"):
            raise ValueError(f"Invalid style status: {identifier}")
        if row["status"] == "ready" and (row.get("video") != identifier + ".mp4" or row.get("poster") != identifier + ".jpg"):
            raise ValueError(f"Invalid style assets: {identifier}")
        seen.add(identifier)
    return payload


def reference(style_id):
    for row in catalog()["records"]:
        if row["id"] == style_id:
            return row
    raise ValueError(f"无效的风格编号 / Unknown cinematic style: {style_id}")


def asset(style_id, kind):
    row = reference(style_id)
    if kind not in ("video", "poster"):
        raise ValueError("Invalid style asset kind")
    if row["status"] != "ready":
        raise ValueError(f"此风格视频尚未制作 / Style video is pending: {style_id}")
    directory = LIBRARY / ("videos" if kind == "video" else "posters")
    path = directory / row[kind]
    if directory.is_symlink() or path.is_symlink() or path.resolve().parent != directory.resolve():
        raise ValueError(f"Unsafe style asset: {style_id}")
    if not path.is_file():
        raise FileNotFoundError(f"风格素材缺失 / Missing style asset: {path.name}")
    return path


def validate_assets(style_id):
    return asset(style_id, "poster"), asset(style_id, "video")


def poster_array(style_id):
    path = asset(style_id, "poster")
    try:
        with Image.open(path) as image:
            return np.array(ImageOps.exif_transpose(image).convert("RGB"), dtype=np.float32) / 255.0
    except (ValueError, OSError) as exc:
        raise ValueError(f"风格封面损坏 / Cannot decode style poster: {path.name}") from exc


def description(row, language):
    label = "常用场景：" if language == "zh" else "Use cases: "
    return row[f"description_{language}"] + "\n\n" + label + row[f"use_cases_{language}"] + "\n\n" + ("易混淆风格：" if language == "zh" else "Distinctions: ") + row[f"distinctions_{language}"]


def fingerprint(style_id):
    row = reference(style_id)
    value = hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode())
    for path in validate_assets(style_id):
        value.update(path.read_bytes())
    return value.hexdigest()


def browser_catalog():
    payload = catalog()
    records = []
    for row in payload["records"]:
        try:
            validate_assets(row["id"])
            available = True
        except (OSError, ValueError):
            available = False
        records.append({**row, "available": available})
    return {"version": payload["version"], "categories": payload["categories"], "records": records}
