from PIL import Image
from pathlib import Path

root = Path(r"e:\HR\hr-attendance-app\assets")
logo = Image.open(root / "ECF-Logo.jpg").convert("RGBA")

# Trim near-white margins
bg = logo.convert("RGB")
w, h = bg.size
pixels = bg.load()


def is_bg(x, y):
    r, g, b = pixels[x, y]
    return r > 245 and g > 245 and b > 245


left, top, right, bottom = w, h, 0, 0
for y in range(h):
    for x in range(w):
        if not is_bg(x, y):
            left = min(left, x)
            top = min(top, y)
            right = max(right, x)
            bottom = max(bottom, y)
if right > left and bottom > top:
    logo = logo.crop((left, top, right + 1, bottom + 1))


def make_icon(size, pad_ratio, bg_color, out_path):
    canvas = Image.new("RGBA", (size, size), bg_color + (255,))
    max_side = int(size * (1 - 2 * pad_ratio))
    lw, lh = logo.size
    scale = min(max_side / lw, max_side / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    out = Image.new("RGB", (size, size), bg_color)
    out.paste(canvas, mask=canvas.split()[3])
    out.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path} ({size}x{size})")


# Expo master icons (white bg fits ECF logo)
make_icon(1024, 0.10, (255, 255, 255), root / "icon.png")
# Adaptive foreground: more padding for Android safe zone
make_icon(1024, 0.18, (255, 255, 255), root / "adaptive-icon.png")
# Splash: logo on brand blue
make_icon(1284, 0.18, (30, 58, 95), root / "splash.png")
# Favicon
make_icon(48, 0.08, (255, 255, 255), root / "favicon.png")
print("done")
