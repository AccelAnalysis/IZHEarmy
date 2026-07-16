#!/usr/bin/env python3
"""Normalize IZHE source media, generate WebP derivatives, and publish review metadata."""
from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

ROOT = Path("IZHE Resource Folder")
ORIGINALS = ROOT / "originals"
PUBLIC = Path("public/assets/media/izhe")
DOCS = Path("docs")
MODULE = Path("netlify/functions/_shared/source-media-library.mjs")
STAMP = "2026-07-16T17:00:00.000Z"

DUPLICATES = [
    ROOT / "Logo Wear Only/izhe1 - Copy.jpg",
    ROOT / "Logo Wear Only/izhe2 - Copy.jpg",
    ROOT / "Logo Wear Only/izhe3 - Copy.jpg",
    ROOT / "Logo Wear Only/izhe4 - Copy.jpg",
]

ASSETS: list[dict[str, Any]] = [
    {
        "source": "IZHE Logo Variants/2020-01-17 (2).png", "original": "brand-marks/izhe-tagline-black-wordmark.png", "slug": "izhe-tagline-black-wordmark",
        "title": "IZHE black wordmark with tagline", "alt": "Black IZHE wordmark above the handwritten line to you what He is to me",
        "category": "brand_mark", "usageStatus": "archived", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "low", "crop": "Landscape mark; suitable only for small archival or reference placement.", "review": "Clean legacy mark but only 651 by 369 pixels.", "use": "Brand-history or internal design reference; do not use as the primary navigation logo."
    },
    {
        "source": "IZHE Logo Variants/Friend[5268].jpg", "original": "brand-marks/izhe-question-friend-blue.jpg", "slug": "izhe-question-friend-blue",
        "title": "IZHE Your Friend question mark", "alt": "Blue IZHE wordmark with the question Your Friend",
        "category": "teaching", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "high", "crop": "Square artwork with strong social-card and teaching-thumbnail potential.", "review": "High-resolution, clean white background, centered mark.", "use": "Names of God teaching card, chapter art, or social graphic after brand-rights approval."
    },
    {
        "source": "IZHE Logo Variants/Healer[5267].jpg", "original": "brand-marks/izhe-question-healer-blue.jpg", "slug": "izhe-question-healer-blue",
        "title": "IZHE Your Healer question mark", "alt": "Blue IZHE wordmark with the question Your Healer",
        "category": "teaching", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "high", "crop": "Square artwork with strong social-card and teaching-thumbnail potential.", "review": "High-resolution, clean white background, centered mark.", "use": "Healer teaching resource, chapter art, or campaign graphic after approval."
    },
    {
        "source": "IZHE Logo Variants/IMG_2779.jpg", "original": "brand-marks/izhe-sunset-tagline-banner.jpg", "slug": "izhe-sunset-tagline-banner",
        "title": "IZHE sunset tagline banner", "alt": "White IZHE wordmark and tagline over a tropical sunset",
        "category": "brand_mark", "usageStatus": "archived", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "low", "crop": "Wide composition, but resolution is too low for a modern full-width hero.", "review": "Visually useful legacy banner with embedded text; source resolution is limited.", "use": "Brand-history feature or internal reference only."
    },
    {
        "source": "IZHE Logo Variants/IZHE[5265] (2).jpg", "original": "brand-marks/izhe-core-wordmark-blue.jpg", "slug": "izhe-core-wordmark-blue",
        "title": "IZHE core blue wordmark", "alt": "Blue IZHE wordmark on a white background",
        "category": "brand_mark", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "medium-high", "crop": "Wide wordmark suited to banners, headers, and presentation title areas.", "review": "Clean, high-width raster mark; vector recreation is still recommended.", "use": "Approved brand applications after ownership and master-logo confirmation."
    },
    {
        "source": "IZHE Logo Variants/Lord[5269].jpg", "original": "brand-marks/izhe-question-lord-blue.jpg", "slug": "izhe-question-lord-blue",
        "title": "IZHE Your Lord question mark", "alt": "Blue IZHE wordmark with the question Your Lord",
        "category": "teaching", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "high", "crop": "Square artwork with strong teaching and social-card potential.", "review": "High-resolution, clean white background, centered mark.", "use": "Lord teaching resource, chapter art, or campaign graphic after approval."
    },
    {
        "source": "IZHE Logo Variants/Peace[5271].jpg", "original": "brand-marks/izhe-question-peace-blue.jpg", "slug": "izhe-question-peace-blue",
        "title": "IZHE Your Peace question mark", "alt": "Blue IZHE wordmark with the question Your Peace",
        "category": "teaching", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "high", "crop": "Square artwork with strong teaching and social-card potential.", "review": "High-resolution, clean white background, centered mark.", "use": "Peace teaching resource, chapter art, or campaign graphic after approval."
    },
    {
        "source": "IZHE Logo Variants/correctIZHE[11487].jpg", "original": "brand-marks/izhe-print-logo-sheet-blue.jpg", "slug": "izhe-print-logo-sheet-blue",
        "title": "IZHE print logo reference sheet", "alt": "A white sheet containing several sizes of blue IZHE wordmarks and question designs",
        "category": "brand_mark", "usageStatus": "archived", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "high", "crop": "Not designed as a single website image; contains multiple production marks.", "review": "Very high resolution but functions as a production/reference sheet rather than public-facing artwork.", "use": "Internal print-production and logo-reference archive."
    },
    {
        "source": "IZHE Logo Variants/king[5266].jpg", "original": "brand-marks/izhe-question-king-blue.jpg", "slug": "izhe-question-king-blue",
        "title": "IZHE Your King question mark", "alt": "Blue IZHE wordmark with the question Your King",
        "category": "teaching", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "not_applicable",
        "quality": "high", "crop": "Square artwork with strong teaching and social-card potential.", "review": "High-resolution, clean white background, centered mark.", "use": "King teaching resource, chapter art, or campaign graphic after approval."
    },
    {
        "source": "IZHE Models/IMG_0212.JPG", "original": "models/izhe-white-healer-hoodie-city-mockup.jpg", "slug": "izhe-white-healer-hoodie-city-mockup",
        "title": "White Your Healer hoodie city mockup", "alt": "A person wearing a white IZHE Your Healer hoodie in a city setting",
        "category": "apparel_product", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "concept_only",
        "quality": "high", "crop": "Landscape image with useful hero and campaign-banner space; subject crop must preserve the hoodie design.", "review": "Professional-looking composite or mockup; exact garment, printing, and model-image licensing are not verified.", "use": "Concept or future Healer collection presentation, not a current product listing until the SKU is confirmed."
    },
    {
        "source": "IZHE Models/IMG_3608 2.PNG", "original": "models/izhe-community-group-blue-shirt-screenshot.png", "slug": "izhe-community-group-blue-shirt-screenshot",
        "title": "IZHE community group photograph screenshot", "alt": "Three adults standing together with the center person wearing a blue IZHE shirt",
        "category": "model_lifestyle", "usageStatus": "archived", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "low", "crop": "Portrait phone screenshot with embedded interface and little crop flexibility.", "review": "Authentic community image but low-resolution and captured as a phone screenshot.", "use": "Internal history archive; obtain the original photograph and releases before public use."
    },
    {
        "source": "IZHE Models/izh2 - Copy.jpg", "original": "models/izhe-model-woman-white-logo-tee-front.jpg", "slug": "izhe-model-woman-white-logo-tee-front",
        "title": "Woman wearing white IZHE logo tee", "alt": "A woman standing on a boardwalk wearing a white IZHE logo T-shirt",
        "category": "model_lifestyle", "usageStatus": "draft", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Strong portrait and four-by-five card crop; not naturally suited to a wide hero.", "review": "Clear full-body lifestyle photograph with visible garment and uncluttered natural background.", "use": "Story, campaign, or apparel lifestyle card after model release and garment/SKU verification."
    },
    {
        "source": "IZHE Models/izhe15.jpg", "original": "models/izhe-model-man-white-logo-hoodie-wide.jpg", "slug": "izhe-model-man-white-logo-hoodie-wide",
        "title": "Man wearing white IZHE logo hoodie", "alt": "A man leaning on a boardwalk railing wearing a white IZHE logo hoodie",
        "category": "model_lifestyle", "usageStatus": "draft", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Strong portrait/card image with some environmental context; wide hero use would require aggressive crop.", "review": "Clear lifestyle image; garment logo is visible but product availability is unverified.", "use": "Campaign or lifestyle presentation after model release and product confirmation."
    },
    {
        "source": "IZHE Models/izhe16.jpg", "original": "models/izhe-model-man-red-tagline-hoodie-front.jpg", "slug": "izhe-model-man-red-tagline-hoodie-front",
        "title": "Man wearing red IZHE tagline hoodie front", "alt": "A man facing the camera in a red IZHE tagline hoodie",
        "category": "model_lifestyle", "usageStatus": "draft", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Strong portrait product/lifestyle crop with centered garment artwork.", "review": "Good front-view garment documentation; background and lighting are casual rather than catalog studio quality.", "use": "Legacy product history or campaign lifestyle content after release and SKU verification."
    },
    {
        "source": "IZHE Models/izhe18.jpg", "original": "models/izhe-model-man-red-tagline-hoodie-back.jpg", "slug": "izhe-model-man-red-tagline-hoodie-back",
        "title": "Man wearing red IZHE tagline hoodie back", "alt": "A man walking away on a boardwalk wearing a red IZHE hoodie",
        "category": "model_lifestyle", "usageStatus": "draft", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Strong portrait and companion back-view crop; rear artwork is not clearly visible.", "review": "Useful companion lifestyle view, but less informative as a primary product image.", "use": "Secondary gallery or brand-history image after release and product verification."
    },
    {
        "source": "IZHE Models/izhe21.jpg", "original": "models/izhe-model-woman-blue-logo-long-sleeve-front.jpg", "slug": "izhe-model-woman-blue-logo-long-sleeve-front",
        "title": "Woman wearing blue IZHE long-sleeve shirt front", "alt": "A woman on a boardwalk wearing a blue long-sleeve IZHE shirt",
        "category": "model_lifestyle", "usageStatus": "draft", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Strong portrait/card crop with visible front artwork.", "review": "Clear lifestyle and garment view; product is not matched to the current catalog.", "use": "Legacy apparel history or campaign card after release and SKU verification."
    },
    {
        "source": "IZHE Models/izhe22.jpg", "original": "models/izhe-model-woman-blue-logo-long-sleeve-back.jpg", "slug": "izhe-model-woman-blue-logo-long-sleeve-back",
        "title": "Woman wearing blue IZHE long-sleeve shirt back", "alt": "Back view of a woman wearing a blue long-sleeve IZHE shirt on a boardwalk",
        "category": "model_lifestyle", "usageStatus": "draft", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Strong portrait companion crop showing the small upper-back mark.", "review": "Useful secondary product-documentation image; not strong enough to lead a public section.", "use": "Secondary gallery or archive after release and product verification."
    },
    {
        "source": "IZHE Models/izhe23.jpg", "original": "models/izhe-model-woman-charcoal-pink-logo-tee-front.jpg", "slug": "izhe-model-woman-charcoal-pink-logo-tee-front",
        "title": "Woman wearing charcoal IZHE tee with pink logo front", "alt": "A woman on a boardwalk wearing a charcoal IZHE T-shirt with a pink logo",
        "category": "model_lifestyle", "usageStatus": "draft", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Strong portrait/card crop with clear front artwork.", "review": "Clear lifestyle image with good garment visibility; exact product is not in the confirmed current catalog.", "use": "Story, social, or apparel lifestyle card after release and product verification."
    },
    {
        "source": "IZHE Models/izhe24.jpg", "original": "models/izhe-model-woman-charcoal-pink-logo-tee-back.jpg", "slug": "izhe-model-woman-charcoal-pink-logo-tee-back",
        "title": "Woman wearing charcoal IZHE tee with pink logo back", "alt": "Back view of a woman wearing a charcoal IZHE T-shirt with a small pink logo",
        "category": "model_lifestyle", "usageStatus": "draft", "rightsStatus": "pending_release", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Strong portrait companion crop showing the upper-back mark.", "review": "Useful secondary garment view; not recommended as a lead visual.", "use": "Secondary gallery or legacy-product archive after release and verification."
    },
    {
        "source": "Logo Wear Only/72262135_733721653756129_4206449304224661504_n.jpg", "original": "apparel/izhe-apparel-inventory-display.jpg", "slug": "izhe-apparel-inventory-display",
        "title": "IZHE apparel inventory display", "alt": "A table displaying folded IZHE shirts and hoodies in several colors",
        "category": "apparel_product", "usageStatus": "archived", "rightsStatus": "unverified", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "limited", "crop": "Portrait documentation image with limited detail and no clean product isolation.", "review": "Useful evidence of earlier inventory but not polished ecommerce photography.", "use": "Brand-history, internal operations, or archival presentation only."
    },
    {
        "source": "Logo Wear Only/IZHE hoodie.jpg", "original": "apparel/izhe-white-logo-hoodie-mockup.jpg", "slug": "izhe-white-logo-hoodie-mockup",
        "title": "White IZHE logo hoodie mockup", "alt": "White hoodie mockup with a blue IZHE logo and blue sleeve marks",
        "category": "apparel_product", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "concept_only",
        "quality": "limited", "crop": "Portrait product mockup suitable for a small concept card.", "review": "Clean mockup but only 591 by 790 pixels and not tied to a confirmed sellable SKU.", "use": "Future-product concept or internal design approval, not current checkout imagery."
    },
    {
        "source": "Logo Wear Only/izhe1.jpg", "original": "apparel/izhe-charcoal-pink-logo-long-sleeve-flatlay.jpg", "slug": "izhe-charcoal-pink-logo-long-sleeve-flatlay",
        "title": "Charcoal IZHE long-sleeve shirt with pink logo flat lay", "alt": "Charcoal long-sleeve shirt laid flat with a pink IZHE logo and tagline",
        "category": "apparel_product", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Portrait product-documentation crop; background should be retouched for ecommerce use.", "review": "High-resolution garment record but casual lighting, wrinkles, and visible surroundings reduce catalog polish.", "use": "Legacy product archive or secondary image after retouching and SKU verification."
    },
    {
        "source": "Logo Wear Only/izhe2.jpg", "original": "apparel/izhe-gray-charcoal-tagline-hoodies-flatlay.jpg", "slug": "izhe-gray-charcoal-tagline-hoodies-flatlay",
        "title": "Gray and charcoal IZHE tagline hoodies flat lay", "alt": "Gray and charcoal IZHE hoodies displayed together with contrasting logos",
        "category": "apparel_product", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Portrait group-product crop; garments overlap and are unsuitable for variant-specific primary images.", "review": "Good historical product documentation but not a clean single-SKU presentation.", "use": "Brand-history or collection overview after product verification; not a primary product image."
    },
    {
        "source": "Logo Wear Only/izhe3.jpg", "original": "apparel/izhe-white-blue-logo-long-sleeve-flatlay.jpg", "slug": "izhe-white-blue-logo-long-sleeve-flatlay",
        "title": "White IZHE long-sleeve shirt with blue logo flat lay", "alt": "White long-sleeve shirt laid flat with a blue IZHE logo and tagline",
        "category": "apparel_product", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "high", "crop": "Portrait product-documentation crop; background and garment should be retouched for ecommerce use.", "review": "High-resolution garment record with casual presentation and unverified current availability.", "use": "Legacy product archive or secondary image after retouching and SKU verification."
    },
    {
        "source": "Logo Wear Only/izhe4.jpg", "original": "apparel/izhe-white-blue-logo-tee-flatlay.jpg", "slug": "izhe-white-blue-logo-tee-flatlay",
        "title": "White IZHE T-shirt with blue logo flat lay", "alt": "White T-shirt laid flat with a blue IZHE logo and tagline",
        "category": "apparel_product", "usageStatus": "draft", "rightsStatus": "unverified", "productAccuracyStatus": "legacy_or_unverified",
        "quality": "medium", "crop": "Portrait product-documentation crop; usable for a small archive card after cleanup.", "review": "Moderate resolution, uneven garment presentation, and unverified product availability.", "use": "Legacy product archive, not current product-card imagery without retouching and SKU verification."
    },
]


def normalized_image(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        return ImageOps.exif_transpose(opened).convert("RGB")


def orientation(width: int, height: int) -> str:
    ratio = width / height
    if 0.9 <= ratio <= 1.1:
        return "square"
    return "landscape" if ratio > 1 else "portrait"


def move_sources() -> None:
    for duplicate in DUPLICATES:
        if duplicate.exists():
            duplicate.unlink()
    for asset in ASSETS:
        source = ROOT / asset["source"]
        destination = ORIGINALS / asset["original"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if source.exists() and source.resolve() != destination.resolve():
                source.unlink()
            continue
        if not source.exists():
            raise FileNotFoundError(f"Missing source asset: {source}")
        shutil.move(source, destination)


def generate_derivatives() -> list[dict[str, Any]]:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    expected = set()
    for asset in ASSETS:
        original = ORIGINALS / asset["original"]
        target = PUBLIC / f"{asset['slug']}.webp"
        expected.add(target.name)
        image = normalized_image(original)
        width, height = image.size
        if max(width, height) > 2200:
            image.thumbnail((2200, 2200), Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=84, method=6, optimize=True)
        out_width, out_height = image.size
        records.append({
            "id": f"source-{asset['slug']}",
            "url": f"/assets/media/izhe/{target.name}",
            "filename": target.name,
            "title": asset["title"],
            "alt": asset["alt"],
            "category": asset["category"],
            "usageStatus": asset["usageStatus"],
            "rightsStatus": asset["rightsStatus"],
            "productAccuracyStatus": asset["productAccuracyStatus"],
            "tags": ["izhe-source", asset["category"].replace("_", "-")],
            "credit": "",
            "notes": asset["review"],
            "recommendedUse": asset["use"],
            "technicalQuality": asset["quality"],
            "cropPotential": asset["crop"],
            "orientation": orientation(width, height),
            "width": width,
            "height": height,
            "optimizedWidth": out_width,
            "optimizedHeight": out_height,
            "sourceType": "repository_source",
            "sourceOriginalPath": original.as_posix(),
            "focalPoint": "center",
            "createdAt": STAMP,
            "updatedAt": STAMP,
            "static": True,
        })
    for existing in PUBLIC.glob("*.webp"):
        if existing.name not in expected:
            existing.unlink()
    return records


def write_module(records: list[dict[str, Any]]) -> None:
    MODULE.parent.mkdir(parents=True, exist_ok=True)
    MODULE.write_text(
        "// Generated by scripts/process_media.py. Edit the source review data, not this file.\n"
        f"export const SOURCE_MEDIA_LIBRARY = {json.dumps(records, indent=2)};\n",
        encoding="utf-8",
    )


def write_docs(records: list[dict[str, Any]]) -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    csv_path = DOCS / "izhe-media-review.csv"
    fields = [
        "id", "title", "sourceOriginalPath", "url", "category", "width", "height", "orientation",
        "technicalQuality", "cropPotential", "rightsStatus", "productAccuracyStatus", "usageStatus", "notes", "recommendedUse"
    ]
    with csv_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for record in records:
            writer.writerow({key: record.get(key, "") for key in fields})
    lines = [
        "# IZHE Source Media Review",
        "",
        "This review covers every unique asset originally uploaded to `IZHE Resource Folder`. Four byte-identical `- Copy` files were removed. High-resolution originals are preserved under `IZHE Resource Folder/originals/`; optimized WebP derivatives are published under `public/assets/media/izhe/`.",
        "",
        "## Governance conclusion",
        "",
        "No photograph containing a recognizable person is approved for public use until a model/photo release is confirmed. Apparel photographs and mockups are not approved as current product images until they are matched to an active catalog SKU, color, garment, print placement, and fulfillment capability. The admin Media Library exposes these statuses so approval can be recorded without replacing the underlying asset.",
        "",
        "## Asset review",
        "",
        "| Asset | Technical quality | Crop potential | Permissions | Product accuracy | Recommended use |",
        "|---|---|---|---|---|---|",
    ]
    for record in records:
        lines.append(
            f"| {record['title']} | {record['technicalQuality']} | {record['cropPotential']} | {record['rightsStatus'].replace('_',' ')} | {record['productAccuracyStatus'].replace('_',' ')} | {record['recommendedUse']} |"
        )
    lines.extend([
        "",
        "## Approval workflow",
        "",
        "1. Confirm image ownership or license and retain supporting documentation.",
        "2. Obtain and retain a release for every recognizable person before changing `rightsStatus` to `release_on_file`.",
        "3. Match apparel imagery to an active SKU before changing `productAccuracyStatus` to `accurate`.",
        "4. Change `usageStatus` to `approved` in the global Media Library only after both reviews are complete.",
        "5. Use the structured-content or visual-editor picker to place the approved asset.",
        "",
    ])
    (DOCS / "IZHE-MEDIA-REVIEW.md").write_text("\n".join(lines), encoding="utf-8")
    (ORIGINALS / "README.md").write_text(
        "# IZHE high-resolution source originals\n\nThese files are preservation masters. Do not reference them directly from the public website. Optimized WebP derivatives are generated by `scripts/process_media.py` into `public/assets/media/izhe/`. Rights, release, product-accuracy, and usage decisions are recorded in `docs/IZHE-MEDIA-REVIEW.md` and the global Media Library.\n",
        encoding="utf-8",
    )


def main() -> None:
    move_sources()
    records = generate_derivatives()
    write_module(records)
    write_docs(records)
    print(f"Processed {len(records)} unique IZHE assets.")


if __name__ == "__main__":
    main()
