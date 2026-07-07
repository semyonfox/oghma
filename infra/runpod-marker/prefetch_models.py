#!/usr/bin/env python3
"""Download Marker model artifacts during image build."""

from __future__ import annotations

import os
from pathlib import Path


def main() -> None:
    os.environ["TORCH_DEVICE"] = "cpu"
    os.environ.setdefault("HF_HOME", "/opt/marker-cache/huggingface")
    os.environ.setdefault("TORCH_HOME", "/opt/marker-cache/torch")
    os.environ.setdefault("XDG_CACHE_HOME", "/opt/marker-cache")

    for name in ("HF_HOME", "TORCH_HOME", "XDG_CACHE_HOME"):
        Path(os.environ[name]).mkdir(parents=True, exist_ok=True)
        print(f"{name}={os.environ[name]}", flush=True)

    from marker.models import create_model_dict

    models = create_model_dict()
    print(f"prefetched marker model groups: {sorted(models.keys())}", flush=True)


if __name__ == "__main__":
    main()
