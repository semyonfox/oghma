#!/usr/bin/env python3
"""Bake the weights selected by the installed Indra and Surya packages."""

import argparse

from huggingface_hub import snapshot_download
from indra_ocr.models import FILES, HF_REPO, HF_REVISION, MATH_FILES, model_dir
from surya.settings import settings


def prefetch_indra() -> None:
    from marker.util import download_font

    download_font()
    path = model_dir(math=True)
    missing = [name for name in (*FILES, *MATH_FILES) if not (path / name).is_file()]
    if missing:
        raise RuntimeError(f"missing Indra assets in {path}: {missing}")
    print(f"prefetched {HF_REPO}@{HF_REVISION}")


def prefetch_surya() -> None:
    checkpoint = settings.SURYA_MODEL_CHECKPOINT
    snapshot_download(checkpoint, max_workers=2)
    print(f"prefetched {checkpoint}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model", choices=("indra", "surya"))
    if parser.parse_args().model == "indra":
        prefetch_indra()
    else:
        prefetch_surya()
