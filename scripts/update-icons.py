"""Generate Expo + Android icons from the full ECF icon (fingerprint + check + ECF).

Pads artwork into Android/iOS safe zones so the OS mask does not crop ECF or the fingerprint.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(
    r"C:\Users\oasfour\.cursor\projects\e-HR-hr-attendance-app\assets"
    r"\c__Users_oasfour_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"6d13b398fbcdd1c60ce7e33fe913c9de_images_Gemini_Generated_Image_"
    r"ks0nbuks0nbuks0n-71c1e498-1c2d-4a1e-b020-0a9da69a6655.png"
)
if not SRC.exists():
    SRC = Path(
        r"C:\Users\oasfour\.cursor\projects\e-HR-hr-attendance-app\assets"
        r"\c__Users_oasfour_AppData_Roaming_Cursor_User_workspaceStorage_"
        r"6d13b398fbcdd1c60ce7e33fe913c9de_images_Gemini_Generated_Image_"
        r"ks0nbuks0nbuks0n-7f0c828f-b668-434b-b24b-2c2edb36d0a3.png"
    )

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
FALLBACK_TEAL = (37, 150, 144)  # #259690

# Android adaptive safe zone is the inner 72/108 ≈ 66.7%. Stay slightly inside.
ADAPTIVE_INNER = 0.64
# iOS / Play Store square still gets rounded; keep a modest inset.
ICON_INNER = 0.78


def extract_full_icon(img: Image.Image) -> tuple[Image.Image, tuple[int, int, int]]:
    """Crop the complete teal icon (fingerprint + ECF), drop the studio mat/shadow."""
    arr = np.array(img.convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.int16)
    teal_mask = (
        (rgb[:, :, 1] > 110)
        & (rgb[:, :, 2] > 80)
        & (rgb[:, :, 1] > rgb[:, :, 0] + 15)
        & (rgb[:, :, 0] < 190)
    )
    ys, xs = np.where(teal_mask)
    if len(xs) < 100:
        raise RuntimeError("Could not find the teal icon in the source image.")
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    inset = max(4, int(min(x1 - x0, y1 - y0) * 0.02))
    x0, y0 = x0 + inset, y0 + inset
    x1, y1 = x1 - inset, y1 - inset

    crop = img.crop((x0, y0, x1 + 1, y1 + 1)).convert("RGBA")
    samples = arr[teal_mask][:, :3]
    teal = tuple(int(x) for x in np.median(samples, axis=0)) if len(samples) else FALLBACK_TEAL

    # Keep only the fingerprint / check / ECF artwork; fill everything else with
    # flat teal so the OS can round a full square without a nested card or crop.
    c = np.array(crop)
    crgb = c[:, :, :3].astype(np.float32)
    luma = crgb.mean(axis=2)
    teal_luma = float(sum(teal)) / 3.0
    is_art = luma > (teal_luma + 32)
    fill = np.empty_like(c)
    fill[:, :, 0] = teal[0]
    fill[:, :, 1] = teal[1]
    fill[:, :, 2] = teal[2]
    fill[:, :, 3] = 255
    fill[is_art] = c[is_art]
    fill[is_art, 3] = 255
    # Studio white lives in the crop corners — never in the ECF / fingerprint.
    corner = max(6, int(min(fill.shape[0], fill.shape[1]) * 0.10))
    fill[:corner, :corner] = (*teal, 255)
    fill[:corner, -corner:] = (*teal, 255)
    fill[-corner:, :corner] = (*teal, 255)
    fill[-corner:, -corner:] = (*teal, 255)
    return Image.fromarray(fill, "RGBA"), teal  # type: ignore[return-value]


def padded_square(
    size: int,
    artwork: Image.Image,
    teal: tuple[int, int, int],
    inner_ratio: float,
) -> Image.Image:
    """Full-bleed teal square with the complete icon scaled into the center."""
    canvas = Image.new("RGB", (size, size), teal)
    inner = max(8, int(round(size * inner_ratio)))
    fitted = artwork.convert("RGB").resize((inner, inner), Image.Resampling.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(fitted, (offset, offset))
    return canvas


def main() -> None:
    if not SRC.exists():
        raise FileNotFoundError(f"Icon source not found: {SRC}")
    img = Image.open(SRC)
    artwork, teal = extract_full_icon(img)
    print(f"teal #{teal[0]:02X}{teal[1]:02X}{teal[2]:02X} artwork={artwork.size}")

    padded_square(1024, artwork, teal, ICON_INNER).save(ASSETS / "icon.png", "PNG", optimize=True)
    padded_square(1024, artwork, teal, ADAPTIVE_INNER).convert("RGBA").save(
        ASSETS / "adaptive-icon.png", "PNG", optimize=True
    )
    padded_square(192, artwork, teal, ICON_INNER).save(ASSETS / "favicon.png", "PNG", optimize=True)

    splash = Image.new("RGB", (1284, 2778), teal)
    logo = padded_square(640, artwork, teal, ICON_INNER)
    splash.paste(logo, ((1284 - 640) // 2, (2778 - 640) // 2))
    splash.save(ASSETS / "splash.png", "PNG", optimize=True)

    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    fg_sizes = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    for folder, sz in sizes.items():
        out = ANDROID_RES / folder
        out.mkdir(parents=True, exist_ok=True)
        im = padded_square(sz, artwork, teal, ICON_INNER)
        im.save(out / "ic_launcher.webp", "WEBP", quality=92)
        im.save(out / "ic_launcher_round.webp", "WEBP", quality=92)

    for folder, sz in fg_sizes.items():
        out = ANDROID_RES / folder
        out.mkdir(parents=True, exist_ok=True)
        padded_square(sz, artwork, teal, ADAPTIVE_INNER).convert("RGBA").save(
            out / "ic_launcher_foreground.webp", "WEBP", quality=92
        )

    splash_sizes = {
        "drawable-mdpi": 96,
        "drawable-hdpi": 144,
        "drawable-xhdpi": 192,
        "drawable-xxhdpi": 288,
        "drawable-xxxhdpi": 384,
    }
    for folder, sz in splash_sizes.items():
        out = ANDROID_RES / folder
        out.mkdir(parents=True, exist_ok=True)
        padded_square(sz, artwork, teal, ICON_INNER).save(
            out / "splashscreen_logo.png", "PNG", optimize=True
        )

    hex_teal = f"#{teal[0]:02X}{teal[1]:02X}{teal[2]:02X}"
    (ANDROID_RES / "values" / "colors.xml").write_text(
        "\n".join(
            [
                "<resources>",
                f'  <color name="splashscreen_background">{hex_teal}</color>',
                f'  <color name="iconBackground">{hex_teal}</color>',
                '  <color name="colorPrimary">#0D9488</color>',
                f'  <color name="colorPrimaryDark">{hex_teal}</color>',
                "</resources>",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print("icons updated (full artwork, safe-zone padded)")


if __name__ == "__main__":
    main()
