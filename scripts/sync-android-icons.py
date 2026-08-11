from PIL import Image
from pathlib import Path

root = Path(r"e:\HR\hr-attendance-app")
icon = Image.open(root / "assets" / "icon.png").convert("RGBA")
adaptive = Image.open(root / "assets" / "adaptive-icon.png").convert("RGBA")
res = root / "android" / "app" / "src" / "main" / "res"

# density -> px for legacy launcher / round
sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
# adaptive foreground is typically 108dp -> denser
fg_sizes = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def save_webp(img, size, path):
    out = img.resize((size, size), Image.Resampling.LANCZOS)
    # webp with alpha for foreground; opaque for launcher
    out.save(path, "WEBP", quality=90)
    print(f"Wrote {path}")


for folder, size in sizes.items():
    d = res / folder
    save_webp(icon, size, d / "ic_launcher.webp")
    save_webp(icon, size, d / "ic_launcher_round.webp")

for folder, size in fg_sizes.items():
    d = res / folder
    save_webp(adaptive, size, d / "ic_launcher_foreground.webp")

print("Android mipmaps updated")
