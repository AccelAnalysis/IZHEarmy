#!/usr/bin/env python3
"""Build a technical inventory and contact sheet for the IZHE source media folder."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(os.environ.get("IZHE_MEDIA_ROOT", "IZHE Resource Folder"))
OUT = Path(os.environ.get("IZHE_MEDIA_AUDIT_OUT", "media-audit-output"))
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp"}
THUMB = (320, 240)
CELL = (360, 310)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def orientation(width: int, height: int) -> str:
    ratio = width / height
    if 0.9 <= ratio <= 1.1:
        return "square"
    return "landscape" if ratio > 1 else "portrait"


def technical_quality(width: int, height: int, size_bytes: int) -> tuple[str, str]:
    pixels = width * height
    shortest = min(width, height)
    if shortest >= 1800 and pixels >= 5_000_000:
        return "high", "Suitable for large responsive sections after crop review."
    if shortest >= 1000 and pixels >= 2_000_000:
        return "medium-high", "Suitable for cards and many section images; hero use requires crop testing."
    if shortest >= 700:
        return "medium", "Suitable for cards, teaching thumbnails, and modest section placement."
    if shortest >= 400:
        return "limited", "Use for small cards or archival presentation only."
    return "low", "Too small for primary website use; retain as an archive/reference asset."


def crop_potential(width: int, height: int) -> str:
    ratio = width / height
    if ratio >= 1.5:
        return "Strong landscape/background potential; verify subject safe area."
    if ratio <= 0.75:
        return "Strong portrait/card potential; not naturally suited to wide hero placement."
    return "Flexible card crop; wide hero use may require an alternate crop or extension."


def load_font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def audit() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    files = sorted(path for path in ROOT.rglob("*") if path.is_file() and path.suffix.lower() in SUPPORTED)
    hashes: dict[str, list[str]] = {}
    for path in files:
        relative = path.as_posix()
        digest = sha256(path)
        hashes.setdefault(digest, []).append(relative)
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            width, height = image.size
            quality, recommendation = technical_quality(width, height, path.stat().st_size)
            rows.append(
                {
                    "source_path": relative,
                    "category": path.parent.name,
                    "filename": path.name,
                    "extension": path.suffix.lower().lstrip("."),
                    "width": width,
                    "height": height,
                    "orientation": orientation(width, height),
                    "aspect_ratio": round(width / height, 3),
                    "size_bytes": path.stat().st_size,
                    "sha256": digest,
                    "duplicate_group": "",
                    "technical_quality": quality,
                    "crop_potential": crop_potential(width, height),
                    "technical_recommendation": recommendation,
                    "permissions_status": "unverified",
                    "product_accuracy_status": "review-required",
                    "visual_review": "Pending human review from contact sheet/original.",
                    "recommended_use": "Pending human review.",
                }
            )
    duplicate_number = 0
    group_by_hash: dict[str, str] = {}
    for digest, members in hashes.items():
        if len(members) > 1:
            duplicate_number += 1
            group_by_hash[digest] = f"duplicate-{duplicate_number:02d}"
    for row in rows:
        row["duplicate_group"] = group_by_hash.get(row["sha256"], "")
    return rows


def write_reports(rows: list[dict[str, Any]]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "media-audit.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    with (OUT / "media-audit.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0].keys()) if rows else [])
        writer.writeheader()
        writer.writerows(rows)


def contact_sheet(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    columns = 3
    page_rows = 4
    per_page = columns * page_rows
    font = load_font(15)
    small = load_font(12)
    pages = math.ceil(len(rows) / per_page)
    for page in range(pages):
        subset = rows[page * per_page : (page + 1) * per_page]
        canvas = Image.new("RGB", (columns * CELL[0], page_rows * CELL[1]), "white")
        draw = ImageDraw.Draw(canvas)
        for index, row in enumerate(subset):
            x = (index % columns) * CELL[0]
            y = (index // columns) * CELL[1]
            with Image.open(row["source_path"]) as source:
                source = ImageOps.exif_transpose(source).convert("RGB")
                thumb = ImageOps.contain(source, THUMB)
                px = x + (CELL[0] - thumb.width) // 2
                py = y + 10 + (THUMB[1] - thumb.height) // 2
                canvas.paste(thumb, (px, py))
            draw.rectangle((x, y, x + CELL[0] - 1, y + CELL[1] - 1), outline="#cbd5e1", width=1)
            label = f"{page * per_page + index + 1:02d}. {row['filename']}"
            draw.text((x + 12, y + 255), label[:44], fill="#0f172a", font=font)
            detail = f"{row['width']}×{row['height']} · {row['orientation']} · {row['technical_quality']}"
            draw.text((x + 12, y + 280), detail, fill="#475569", font=small)
        canvas.save(OUT / f"contact-sheet-{page + 1:02d}.jpg", quality=90, optimize=True)


def main() -> None:
    if not ROOT.exists():
        raise SystemExit(f"Media root does not exist: {ROOT}")
    rows = audit()
    write_reports(rows)
    contact_sheet(rows)
    print(f"Audited {len(rows)} media files into {OUT}")


if __name__ == "__main__":
    main()
