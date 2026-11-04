"""Bilingual motion references, including text-only entries awaiting production."""
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps
from .catalog import ROOT

LIBRARY = ROOT / "library" / "motions"
FIELDS = ("name_zh", "name_en", "prompt_zh", "prompt_en", "example_prompt_zh", "example_prompt_en",
          "description_zh", "description_en", "use_cases_zh", "use_cases_en")


@lru_cache(maxsize=1)
def catalog():
    payload = json.loads((LIBRARY / "catalog.json").read_text(encoding="utf-8"))
    categories = {row["id"] for row in payload["categories"]}
    seen = set()
    for row in payload["records"]:
        identifier = row["id"]
        if identifier in seen or row["category"] not in categories or not all(
            char in "abcdefghijklmnopqrstuvwxyz0123456789_" for char in identifier
        ) or not identifier:
            raise ValueError(f"Invalid cinematic motion: {identifier}")
        if not all(isinstance(row.get(key), str) and row[key].strip() for key in FIELDS):
            raise ValueError(f"Incomplete bilingual motion: {identifier}")
        if row["status"] not in ("pending", "ready"):
            raise ValueError(f"Invalid motion status: {identifier}")
        if row["status"] == "ready" and (row.get("video") != identifier + ".mp4" or row.get("poster") != identifier + ".jpg"):
            raise ValueError(f"Invalid motion assets: {identifier}")
        seen.add(identifier)
    return payload


def reference(motion_id):
    for row in catalog()["records"]:
        if row["id"] == motion_id:
            return row
    raise ValueError(f"无效的运镜编号 / Unknown cinematic motion: {motion_id}")


def asset(motion_id, kind):
    row = reference(motion_id)
    if kind not in ("video", "poster"):
        raise ValueError("Invalid motion asset kind")
    if row["status"] != "ready":
        raise ValueError(f"此运镜视频尚未制作 / Motion video is pending: {motion_id}")
    directory = LIBRARY / ("videos" if kind == "video" else "posters")
    path = directory / row[kind]
    if directory.is_symlink() or path.is_symlink() or path.resolve().parent != directory.resolve():
        raise ValueError(f"Unsafe motion asset: {motion_id}")
    if not path.is_file():
        raise FileNotFoundError(f"运镜素材缺失 / Missing motion asset: {path.name}")
    return path


def validate_assets(motion_id):
    return asset(motion_id, "poster"), asset(motion_id, "video")


def poster_array(motion_id):
    path = asset(motion_id, "poster")
    try:
        with Image.open(path) as image:
            return np.array(ImageOps.exif_transpose(image).convert("RGB"), dtype=np.float32) / 255.0
    except (ValueError, OSError) as exc:
        raise ValueError(f"运镜封面损坏 / Cannot decode motion poster: {path.name}") from exc


def description(row, language):
    label = "常用场景：" if language == "zh" else "Use cases: "
    return row[f"description_{language}"] + "\n\n" + label + row[f"use_cases_{language}"]


def fingerprint(motion_id):
    row = reference(motion_id)
    value = hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode())
    for path in validate_assets(motion_id):
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
