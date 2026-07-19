#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import shutil
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

METRICS_NAMES = {
    "complete.json",
    "downloads-summary.json",
    "repeat.json",
    "requests.jsonl",
    "run-manifest.json",
    "skipped.json",
    "summary.json",
    "telemetry.jsonl",
}
QUALITY_SUFFIXES = {".md", ".png", ".jpg", ".jpeg", ".webp", ".log", ".txt"}
SECRET_PATTERNS = [
    re.compile(rb"AKIA[0-9A-Z]{16}"),
    re.compile(rb"(?i)(aws_secret_access_key|storage_secret_key|marker_api_token)\s*[:=]\s*\S+"),
    re.compile(rb"(?i)authorization\s*[:=]\s*bearer\s+\S+"),
    re.compile(rb"(?i)[?&]X-Amz-Signature="),
]
METRICS_FORBIDDEN = [
    re.compile(rb"https?://"),
    re.compile(rb"/(?:home|workspace|tmp)/"),
    re.compile(rb"\b[0-9]{12}\b"),
    re.compile(rb"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE),
]


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path = Path(path)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(path, 0o600)


def classify(relative):
    parts = relative.parts
    if "private" in parts or "output" in parts or relative.name == "downloads.jsonl":
        return "restricted"
    if "comparison" in parts:
        return "quality"
    if relative.name in METRICS_NAMES:
        return "metrics"
    if relative.suffix.lower() in QUALITY_SUFFIXES or relative.name.endswith("_meta.json"):
        return "quality"
    raise ValueError(f"unclassified result path: {relative.as_posix()}")


def scan_file(path, bundle_class):
    if path.stat().st_size > 64 * 1024 * 1024:
        return
    data = path.read_bytes()
    for pattern in SECRET_PATTERNS:
        if pattern.search(data):
            raise ValueError(f"secret-like content in {path.name}")
    if bundle_class == "metrics":
        for pattern in METRICS_FORBIDDEN:
            if pattern.search(data):
                raise ValueError(f"private operational content in metrics file {path.name}")


def safe_source_files(results):
    results = Path(results).resolve()
    files = []
    for path in sorted(results.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"symlinks are not allowed: {path.relative_to(results)}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f"unsupported result entry: {path.relative_to(results)}")
        relative = path.relative_to(results)
        if path.suffix.lower() == ".pdf" or "url" in path.name.lower() or path.name.endswith(".env"):
            raise ValueError(f"forbidden result file: {relative.as_posix()}")
        files.append((path, relative, classify(relative)))
    if not files:
        raise ValueError("results directory is empty")
    return files


def finalize_one(files, bundle_class, bundle_path, run_label):
    bundle_path = Path(bundle_path).resolve()
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"marker-{bundle_class}-") as temporary:
        root = Path(temporary) / bundle_class
        root.mkdir(mode=0o700)
        manifest_files = []
        for source, relative, classification in files:
            if classification != bundle_class:
                continue
            scan_file(source, bundle_class)
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            shutil.copyfile(source, destination)
            os.chmod(destination, 0o600)
            manifest_files.append(
                {
                    "path": relative.as_posix(),
                    "bytes": destination.stat().st_size,
                    "sha256": file_sha256(destination),
                    "classification": bundle_class,
                }
            )
        descriptor = {
            "schemaVersion": 1,
            "bundleClass": bundle_class,
            "runLabel": run_label,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "files": len(manifest_files),
        }
        write_json(root / "bundle.json", descriptor)
        write_json(root / "manifest.json", {"schemaVersion": 1, "files": manifest_files})
        with tarfile.open(bundle_path, "w:gz", format=tarfile.PAX_FORMAT) as archive:
            archive.add(root, arcname=bundle_class, recursive=True)
    checksum_path = Path(f"{bundle_path}.sha256")
    checksum_path.write_text(f"{file_sha256(bundle_path)}  {bundle_path.name}\n", encoding="utf-8")
    os.chmod(bundle_path, 0o600)
    os.chmod(checksum_path, 0o600)
    return {
        "bundleClass": bundle_class,
        "path": str(bundle_path),
        "sha256": file_sha256(bundle_path),
        "files": len(manifest_files),
    }


def finalize(results, prefix, run_label):
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", run_label):
        raise ValueError("run label must be a safe lowercase identifier")
    files = safe_source_files(results)
    return [
        finalize_one(files, bundle_class, f"{prefix}-{bundle_class}.tar.gz", run_label)
        for bundle_class in ("metrics", "quality", "restricted")
    ]


def validate_member(member):
    name = PurePosixPath(member.name)
    if name.is_absolute() or ".." in name.parts:
        raise ValueError(f"unsafe archive path: {member.name}")
    if member.issym() or member.islnk() or member.isdev() or member.isfifo():
        raise ValueError(f"unsafe archive member: {member.name}")


def verify(bundle, checksum=None, receipt=None):
    bundle = Path(bundle).resolve()
    expected_checksum = None
    if checksum:
        checksum_path = Path(checksum)
        fields = checksum_path.read_text(encoding="utf-8").strip().split()
        if len(fields) < 1:
            raise ValueError("invalid outer checksum file")
        expected_checksum = fields[0]
        if file_sha256(bundle) != expected_checksum:
            raise ValueError("outer bundle checksum mismatch")
    with tempfile.TemporaryDirectory(prefix="marker-bundle-verify-") as temporary:
        destination = Path(temporary)
        with tarfile.open(bundle, "r:gz") as archive:
            members = archive.getmembers()
            for member in members:
                validate_member(member)
            if hasattr(tarfile, "data_filter"):
                archive.extractall(destination, filter="data")
            else:
                archive.extractall(destination)
        roots = [path for path in destination.iterdir() if path.is_dir()]
        if len(roots) != 1 or roots[0].name not in {"metrics", "quality", "restricted"}:
            raise ValueError("bundle must contain one classified root")
        root = roots[0]
        descriptor = json.loads((root / "bundle.json").read_text(encoding="utf-8"))
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        if descriptor.get("bundleClass") != root.name:
            raise ValueError("bundle class mismatch")
        expected_paths = {"bundle.json", "manifest.json"}
        for record in manifest.get("files", []):
            relative = PurePosixPath(record["path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("unsafe manifest path")
            path = root.joinpath(*relative.parts)
            if not path.is_file():
                raise ValueError(f"missing manifest file: {record['path']}")
            if path.stat().st_size != record["bytes"] or file_sha256(path) != record["sha256"]:
                raise ValueError(f"manifest mismatch: {record['path']}")
            if record.get("classification") != root.name:
                raise ValueError(f"classification mismatch: {record['path']}")
            scan_file(path, root.name)
            expected_paths.add(record["path"])
        actual_paths = {
            path.relative_to(root).as_posix()
            for path in root.rglob("*")
            if path.is_file()
        }
        if actual_paths != expected_paths:
            raise ValueError("bundle contains files outside its manifest")
        result = {
            "schemaVersion": 1,
            "bundleClass": root.name,
            "runLabel": descriptor["runLabel"],
            "bundleSha256": file_sha256(bundle),
            "manifestSha256": file_sha256(root / "manifest.json"),
            "files": len(manifest.get("files", [])),
            "bytes": bundle.stat().st_size,
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
        }
    if expected_checksum and result["bundleSha256"] != expected_checksum:
        raise ValueError("receipt checksum mismatch")
    if receipt:
        write_json(receipt, result)
    print(json.dumps(result, indent=2, sort_keys=True))
    return result


def main():
    parser = argparse.ArgumentParser(description="Finalize and verify Marker benchmark bundles")
    subparsers = parser.add_subparsers(dest="command", required=True)
    finalize_parser = subparsers.add_parser("finalize")
    finalize_parser.add_argument("results")
    finalize_parser.add_argument("prefix")
    finalize_parser.add_argument("--run-label", required=True)
    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("bundle")
    verify_parser.add_argument("--checksum")
    verify_parser.add_argument("--receipt")
    args = parser.parse_args()
    if args.command == "finalize":
        print(json.dumps(finalize(args.results, args.prefix, args.run_label), indent=2))
    else:
        verify(args.bundle, args.checksum, args.receipt)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, tarfile.TarError, json.JSONDecodeError) as exc:
        raise SystemExit(f"error: {exc}")
