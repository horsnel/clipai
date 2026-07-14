#!/usr/bin/env python3
"""Generate a clean, branded ClipAI logo PNG for Google OAuth consent screen.

Specs required by Google:
- Square
- PNG or JPG
- ≤ 1 MB
- Min 120x120, recommended 256x256 or larger

Design: matches the in-app brand:
  - Dark background #0B0B0D
  - Cyan→blue gradient rounded square
  - Lightning bolt (Zap icon) in black, centered
"""
from PIL import Image, ImageDraw
import math
import os

OUT_DIR = "/home/z/my-project/clipai-v2/app/public"
os.makedirs(OUT_DIR, exist_ok=True)

# Brand colors
BG_DARK = (11, 11, 13)          # #0B0B0D
CYAN = (0, 240, 255)            # #00F0FF (primary)
BLUE = (59, 130, 246)           # #3B82F6 (blue-500)
BLACK = (0, 0, 0)

def make_gradient(size, c1, c2, direction="diagonal"):
    """Create a diagonal gradient image."""
    img = Image.new("RGB", (size, size), c1)
    px = img.load()
    for y in range(size):
        for x in range(size):
            if direction == "diagonal":
                t = (x + y) / (2 * size)
            elif direction == "vertical":
                t = y / size
            else:  # horizontal
                t = x / size
            r = int(c1[0] + (c2[0] - c1[0]) * t)
            g = int(c1[1] + (c2[1] - c1[1]) * t)
            b = int(c1[2] + (c2[2] - c1[2]) * t)
            px[x, y] = (r, g, b)
    return img

def draw_rounded_square(draw, size, radius, color):
    """Draw a filled rounded square covering the full canvas."""
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=color,
    )

def draw_lightning_bolt(draw, size):
    """Draw a Lucide-style Zap lightning bolt, centered, in black."""
    # Lucide 'zap' path normalized to 24x24 viewBox, then scaled to size.
    # Original path: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z'
    # We re-anchor and scale to fit nicely in the gradient square.
    # The path's bounding box: x in [3, 21], y in [2, 22] — roughly 18x20.
    # We'll scale it to ~55% of the gradient size and center it.
    scale = size * 0.55 / 24  # 55% of size, original is 24x24 grid
    # Offset to center the bolt (bolt center is roughly at (12, 12) in original)
    offset_x = (size - 24 * scale) / 2
    offset_y = (size - 24 * scale) / 2

    def p(x, y):
        return (offset_x + x * scale, offset_y + y * scale)

    # Polygon vertices for the Zap bolt (slightly cleaned up)
    bolt = [
        p(13, 2),   # top
        p(3, 14),   # left mid
        p(11, 14),  # bottom-left of top segment
        p(10, 22),  # bottom point
        p(20, 10),  # right mid
        p(12, 10),  # bottom-right of top segment
        p(13, 2),   # close
    ]
    draw.polygon(bolt, fill=BLACK)

def make_logo(size, out_path):
    # Start with dark bg
    img = Image.new("RGBA", (size, size), BG_DARK + (255,))
    draw = ImageDraw.Draw(img)

    # Gradient rounded square — make it cover ~85% of the canvas, centered
    grad_size = int(size * 0.85)
    grad_offset = (size - grad_size) // 2
    grad_img = make_gradient(grad_size, CYAN, BLUE, direction="diagonal")
    # Convert to RGBA for compositing
    grad_img = grad_img.convert("RGBA")

    # Use a mask to round the corners of the gradient
    mask = Image.new("L", (grad_size, grad_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    radius = int(grad_size * 0.22)  # 22% corner radius — matches the in-app rounded-lg feel
    mask_draw.rounded_rectangle([(0, 0), (grad_size - 1, grad_size - 1)], radius=radius, fill=255)

    img.paste(grad_img, (grad_offset, grad_offset), mask)

    # Draw the lightning bolt on top, centered on the gradient
    draw = ImageDraw.Draw(img)
    # We want the bolt to sit inside the gradient area
    # Make a sub-image approach: draw on a transparent layer then composite
    bolt_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bolt_draw = ImageDraw.Draw(bolt_layer)
    draw_lightning_bolt(bolt_draw, size)
    img = Image.alpha_composite(img, bolt_layer)

    img.save(out_path, "PNG", optimize=True)
    file_size_kb = os.path.getsize(out_path) / 1024
    print(f"  ✓ {out_path}  ({size}x{size}, {file_size_kb:.1f} KB)")

# Generate three sizes for different use cases
print("Generating ClipAI logos:")

# 512x512 — primary, for Google OAuth (well under 1MB limit)
make_logo(512, f"{OUT_DIR}/clipai-logo-512.png")

# 256x256 — fallback / favicon size
make_logo(256, f"{OUT_DIR}/clipai-logo-256.png")

# 1024x1024 — high-res for press / social (still under 1MB after PNG optimize)
make_logo(1024, f"{OUT_DIR}/clipai-logo-1024.png")

# Also a transparent-bg version (just the gradient square + bolt, no dark bg)
# for use on light backgrounds / marketing assets
print()
print("Transparent-bg variants (for marketing):")

def make_logo_transparent(size, out_path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad_size = size
    grad_img = make_gradient(grad_size, CYAN, BLUE, direction="diagonal").convert("RGBA")
    mask = Image.new("L", (grad_size, grad_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    radius = int(grad_size * 0.22)
    mask_draw.rounded_rectangle([(0, 0), (grad_size - 1, grad_size - 1)], radius=radius, fill=255)
    img.paste(grad_img, (0, 0), mask)
    bolt_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bolt_draw = ImageDraw.Draw(bolt_layer)
    draw_lightning_bolt(bolt_draw, size)
    img = Image.alpha_composite(img, bolt_layer)
    img.save(out_path, "PNG", optimize=True)
    file_size_kb = os.path.getsize(out_path) / 1024
    print(f"  ✓ {out_path}  ({size}x{size}, {file_size_kb:.1f} KB)")

make_logo_transparent(512, f"{OUT_DIR}/clipai-logo-transparent-512.png")
make_logo_transparent(1024, f"{OUT_DIR}/clipai-logo-transparent-1024.png")

print()
print("Done. Files are in /home/z/my-project/clipai-v2/app/public/")
print("Download at:")
print("  https://clipai-bqo.pages.dev/clipai-logo-512.png  (use this for Google OAuth)")
print("  https://clipai-bqo.pages.dev/clipai-logo-256.png")
print("  https://clipai-bqo.pages.dev/clipai-logo-1024.png")
print("  https://clipai-bqo.pages.dev/clipai-logo-transparent-512.png")
print("  https://clipai-bqo.pages.dev/clipai-logo-transparent-1024.png")
