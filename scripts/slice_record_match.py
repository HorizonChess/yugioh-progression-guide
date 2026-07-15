import argparse
import json
import os
from typing import Dict, Any

import cv2


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def pct_to_px(pct: float, total: int) -> int:
    return int(round((pct / 100.0) * total))


def clamp(value: int, min_value: int, max_value: int) -> int:
    return max(min_value, min(value, max_value))


def main() -> None:
    parser = argparse.ArgumentParser(description="Slice Record Match UI into layered assets.")
    parser.add_argument(
        "--layout",
        default="scripts/record_match_layout.json",
        help="Path to layout JSON exported from the layout designer (fixed mode).",
    )
    parser.add_argument(
        "--slices",
        default="scripts/record_match_slices.json",
        help="Path to slice definitions JSON.",
    )
    parser.add_argument("--source", default=None, help="Override source image path.")
    parser.add_argument("--output", default=None, help="Override output directory.")
    args = parser.parse_args()

    layout = load_json(args.layout)
    if "elements" in layout:
        raise ValueError("Layout JSON appears to be grid mode; export fixed mode instead.")

    slices_config = load_json(args.slices)
    source_image = args.source or slices_config.get("sourceImage")
    output_dir = args.output or slices_config.get("outputDir")
    debug_image = slices_config.get(
        "debugImage", os.path.join(output_dir or "", "_debug_slices.png")
    )
    slice_defs = slices_config.get("slices", [])

    if not source_image:
        raise ValueError("Missing sourceImage in slice config or --source override.")
    if not output_dir:
        raise ValueError("Missing outputDir in slice config or --output override.")

    img = cv2.imread(source_image)
    if img is None:
        raise FileNotFoundError(f"Could not read source image: {source_image}")

    img_h, img_w = img.shape[:2]
    os.makedirs(output_dir, exist_ok=True)

    debug_canvas = img.copy()
    manifest = []

    for slice_def in slice_defs:
        name = slice_def.get("name")
        layout_id = slice_def.get("layoutId")
        if not name or not layout_id:
            print(f"Skipping slice with missing name/layoutId: {slice_def}")
            continue

        layout_box = layout.get(layout_id)
        if not layout_box:
            print(f"Layout id not found, skipping: {layout_id}")
            continue

        top = float(layout_box["top"])
        left = float(layout_box["left"])
        width = float(layout_box["width"])
        height = float(layout_box["height"])

        pad = slice_def.get("paddingPct", {})
        pad_top = float(pad.get("top", 0))
        pad_right = float(pad.get("right", 0))
        pad_bottom = float(pad.get("bottom", 0))
        pad_left = float(pad.get("left", 0))

        x1 = pct_to_px(left, img_w) - pct_to_px(pad_left, img_w)
        y1 = pct_to_px(top, img_h) - pct_to_px(pad_top, img_h)
        x2 = pct_to_px(left + width, img_w) + pct_to_px(pad_right, img_w)
        y2 = pct_to_px(top + height, img_h) + pct_to_px(pad_bottom, img_h)

        x1 = clamp(x1, 0, img_w)
        y1 = clamp(y1, 0, img_h)
        x2 = clamp(x2, 0, img_w)
        y2 = clamp(y2, 0, img_h)

        w = x2 - x1
        h = y2 - y1
        if w <= 0 or h <= 0:
            print(f"Invalid slice after padding, skipping: {name}")
            continue

        crop = img[y1:y2, x1:x2]
        output_file = os.path.join(output_dir, f"{name}.png")
        cv2.imwrite(output_file, crop)

        cv2.rectangle(debug_canvas, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            debug_canvas,
            name,
            (x1 + 6, y1 + 18),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 0),
            3,
        )
        cv2.putText(
            debug_canvas,
            name,
            (x1 + 6, y1 + 18),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
        )

        manifest.append(
            {
                "name": name,
                "layoutId": layout_id,
                "percent": {"top": top, "left": left, "width": width, "height": height},
                "pixels": {"x": x1, "y": y1, "width": w, "height": h},
                "file": output_file.replace("\\", "/"),
            }
        )

    if debug_image:
        os.makedirs(os.path.dirname(debug_image), exist_ok=True)
        cv2.imwrite(debug_image, debug_canvas)

    manifest_path = os.path.join(output_dir, "slices_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump({"source": source_image, "slices": manifest}, handle, indent=2)

    print(f"Slices written to: {output_dir}")
    print(f"Manifest: {manifest_path}")
    if debug_image:
        print(f"Debug image: {debug_image}")


if __name__ == "__main__":
    main()
