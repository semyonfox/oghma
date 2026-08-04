#!/usr/bin/env python3
"""Download all models used by the no-hosted-vision Marker++ path."""

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

    from huggingface_hub import snapshot_download
    from surya.common.rfdetr_torch import resolve_model_dir
    from surya.ocr_error.loader import _resolve_checkpoint
    from surya.settings import settings

    snapshot_download(settings.SURYA_MODEL_CHECKPOINT)
    resolve_model_dir(settings.FAST_LAYOUT_MODEL_CHECKPOINT)
    _resolve_checkpoint(settings.OCR_ERROR_MODEL_CHECKPOINT)
    print("prefetched Marker model assets", flush=True)


if __name__ == "__main__":
    main()
