#!/usr/bin/env python3
"""Generate the "WJ" home-screen icon set for the site.

Deliberately an original monogram design, not the official podcast cover
art - this project doesn't redistribute Polskie Radio's copyrighted assets,
only their public MP3 stream URLs (see README). The color palette is a
loose nod to the show's branding (warm cream background, orange accent).

Usage:
    python scripts/generate_icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "docs" / "icons"

BACKGROUND = "#EDE3C4"
TEXT_COLOR = "#241F16"
ACCENT = "#E8A33D"

FONT_PATH = "C:/Windows/Fonts/segoeuib.ttf"

# (filename, pixel size)
SIZES = [
    ("icon-512.png", 512),
    ("icon-192.png", 192),
    ("apple-touch-icon.png", 180),
    ("favicon-32.png", 32),
    ("favicon-16.png", 16),
]


def render_master(size: int = 1024) -> Image.Image:
    img = Image.new("RGB", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(img)

    # Small accent circle (a nod to the sun in the show's cover art, without
    # copying its illustration) in the top-right corner.
    r = size * 0.11
    cx, cy = size * 0.78, size * 0.22
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)

    text = "WJ"
    font = ImageFont.truetype(FONT_PATH, size=int(size * 0.46))
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pos = ((size - text_w) / 2 - bbox[0], (size - text_h) / 2 - bbox[1] + size * 0.04)
    draw.text(pos, text, font=font, fill=TEXT_COLOR)

    return img


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    master = render_master()

    for filename, size in SIZES:
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(OUTPUT_DIR / filename)
        print(f"Wrote {OUTPUT_DIR / filename} ({size}x{size})")


if __name__ == "__main__":
    main()
