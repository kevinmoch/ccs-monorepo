#!/usr/bin/env python3
"""
Resize Android app icons proportionally, centering them on the original canvas
to add padding on all sides (especially left/right as the cloud was too wide).
"""
from PIL import Image
import os

BASE = '/Users/mochunhui/Git/ccs-monorepo/apps/ccs-android/android/app/src/main/res'
FOLDERS = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi']
FILES = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']

# Scale factor: 0.75 means the icon will be 75% of original size,
# leaving 12.5% padding on each side
SCALE = 0.75

def resize_and_center(img_path: str, scale: float) -> None:
    img = Image.open(img_path)
    original_size = img.size

    # Calculate new size
    new_width = int(original_size[0] * scale)
    new_height = int(original_size[1] * scale)

    # Resize with high-quality resampling
    resized = img.resize((new_width, new_height), Image.LANCZOS)

    # Create a transparent canvas of original size
    canvas = Image.new('RGBA', original_size, (0, 0, 0, 0))

    # Calculate position to center the resized image
    x_offset = (original_size[0] - new_width) // 2
    y_offset = (original_size[1] - new_height) // 2

    # Paste resized image onto canvas
    canvas.paste(resized, (x_offset, y_offset), resized if resized.mode == 'RGBA' else None)

    # Save
    canvas.save(img_path, 'PNG')
    print(f'  ✓ {os.path.basename(os.path.dirname(img_path))}/{os.path.basename(img_path)}: {original_size} -> ({new_width}, {new_height}) centered')


def main():
    for folder in FOLDERS:
        for filename in FILES:
            path = os.path.join(BASE, folder, filename)
            if os.path.exists(path):
                resize_and_center(path, SCALE)
    print('\nDone! All icons resized to {}% with centered padding.'.format(int(SCALE * 100)))


if __name__ == '__main__':
    main()
