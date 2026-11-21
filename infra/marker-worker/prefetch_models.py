#!/usr/bin/env python3
"""Bake pinned model snapshots and record the revisions installed in the image."""

import argparse
import json
import os
import re
from pathlib import Path

from huggingface_hub import snapshot_download
from indra_ocr.models import FILES, HF_REPO, MATH_FILES, model_dir


def prefetch_indra(revision: str) -> Path:
    from marker.util import download_font

    download_font()
    path = model_dir(revision=revision, math=True)
    missing = [name for name in (*FILES, *MATH_FILES) if not (path / name).is_file()]
    if missing:
        raise RuntimeError(f"missing Indra assets in {path}: {missing}")
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model", choices=("indra", "surya"))
    parser.add_argument("revision")
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.revision):
        parser.error("revision must be a full Hugging Face commit SHA")

    if args.model == "indra":
        repo = HF_REPO
        snapshot = prefetch_indra(args.revision)
    else:
        repo = os.environ["MARKER_SURYA_REPO"]
        snapshot = Path(snapshot_download(repo, revision=args.revision, max_workers=2))

    if snapshot.name != args.revision:
        raise RuntimeError(f"expected revision {args.revision}, got {snapshot}")
    if not args.destination.is_symlink():
        args.destination.symlink_to(snapshot, target_is_directory=True)
    if args.destination.resolve(strict=True) != snapshot.resolve(strict=True):
        raise RuntimeError(f"{args.destination} does not point to {snapshot}")

    manifest_path = Path("/app/marker-plus-plus.manifest.json")
    manifest = json.loads(manifest_path.read_text())
    manifest.setdefault("models", {})[args.model] = {"repo": repo, "revision": args.revision}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"prefetched {repo}@{args.revision}")
