"""Upscales every PNG in one folder 4x with an ESRGAN-family model, into another folder.

    python upscale.py <model.pth> <in dir> <out dir>

Needs torch and spandrel (the local ComfyUI venv has both) and runs on the GPU when there is one.
Used by tournament-pack-art.mjs: Yugipedia's English tournament-pack scans are mostly 150-220px wide.
"""
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from spandrel import ModelLoader

model_path, src, dst = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
dst.mkdir(parents=True, exist_ok=True)
device = "cuda" if torch.cuda.is_available() else "cpu"
model = ModelLoader().load_from_file(model_path).to(device).eval()

for path in sorted(src.glob("*.png")):
    img = Image.open(path).convert("RGBA")
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    x = torch.from_numpy(rgb).permute(2, 0, 1).unsqueeze(0).to(device)
    with torch.no_grad():
        y = model(x).clamp(0, 1)
    out = Image.fromarray((y[0].permute(1, 2, 0).cpu().numpy() * 255).round().astype(np.uint8))
    # Transparency (the area around a pack) is scaled up plainly.
    out.putalpha(img.getchannel("A").resize(out.size, Image.LANCZOS))
    out.save(dst / path.name)
    print(f"{path.name}: {img.size} -> {out.size}")
