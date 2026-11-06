#!/usr/bin/env python3
"""(Re)create orchard/public/photos/ for the compare mode.

Photos are intentionally NOT in git (bulk imagery). This script collects the
9 reference photos from oldwww/img/ (weekly 2020-2022 series) and newimages/
(2026) into orchard/public/photos/, downscaling anything above 2000 px.
Idempotent: re-running refreshes the copies.
"""
import json
import os
import shutil
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PHOTOS_JSON = os.path.join(ROOT, "orchard", "src", "photos.json")
DEST_DIR = os.path.join(ROOT, "orchard", "public", "photos")


def main() -> int:
    photos = json.load(open(PHOTOS_JSON))
    os.makedirs(DEST_DIR, exist_ok=True)
    ok = 0
    for entry in photos:
        name = os.path.basename(entry["file"])
        dst = os.path.join(DEST_DIR, name)
        src = None
        for cand in (
            os.path.join(ROOT, "oldwww", "img", name),
            os.path.join(ROOT, "newimages", name),
        ):
            if os.path.exists(cand):
                src = cand
                break
        if src is None:
            print(f"MISSING source for {name} (expected under oldwww/img/ or newimages/)")
            continue
        im = Image.open(src)
        if max(im.size) > 2000:
            im.thumbnail((2000, 2000))
            im.convert("RGB").save(dst, quality=85)
        else:
            shutil.copy(src, dst)
        ok += 1
    print(f"{ok}/{len(photos)} photos copied to {DEST_DIR}")
    return 0 if ok == len(photos) else 1


if __name__ == "__main__":
    sys.exit(main())
