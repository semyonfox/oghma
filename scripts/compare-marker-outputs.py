#!/usr/bin/env python3
import argparse
import difflib
import hashlib
import json
import re
from pathlib import Path


def normalized(text):
    text = text.replace("\r\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def structure(text):
    return {
        "headings": len(re.findall(r"^#{1,6}\s", text, re.MULTILINE)),
        "tables": len(re.findall(r"<table\b", text, re.IGNORECASE))
        + len(re.findall(r"^\|.*\|$", text, re.MULTILINE)),
        "displayEquations": text.count("$$") // 2,
        "codeFences": len(re.findall(r"^```", text, re.MULTILINE)) // 2,
        "links": len(re.findall(r"(?<!!)\[[^\]]+\]\([^)]+\)", text)),
        "images": len(re.findall(r"!\[[^\]]*\]\([^)]+\)", text)),
    }


def metadata_for(markdown_path):
    meta_path = markdown_path.with_name(f"{markdown_path.stem}_meta.json")
    if not meta_path.is_file():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def image_hashes(markdown_path):
    hashes = {}
    for path in sorted(markdown_path.parent.iterdir()):
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            hashes[path.name] = sha256_bytes(path.read_bytes())
    return hashes


def compare(reference_dir, candidate_dir):
    reference_files = {
        path.relative_to(reference_dir).as_posix(): path
        for path in reference_dir.rglob("*.md")
    }
    candidate_files = {
        path.relative_to(candidate_dir).as_posix(): path
        for path in candidate_dir.rglob("*.md")
    }
    records = []
    for name in sorted(reference_files.keys() | candidate_files.keys()):
        reference_path = reference_files.get(name)
        candidate_path = candidate_files.get(name)
        reference_raw = reference_path.read_text(errors="replace") if reference_path else ""
        candidate_raw = candidate_path.read_text(errors="replace") if candidate_path else ""
        reference = normalized(reference_raw)
        candidate = normalized(candidate_raw)
        reference_meta = metadata_for(reference_path) if reference_path else None
        candidate_meta = metadata_for(candidate_path) if candidate_path else None
        reference_pages = reference_meta.get("page_stats") if isinstance(reference_meta, dict) else None
        candidate_pages = candidate_meta.get("page_stats") if isinstance(candidate_meta, dict) else None
        reference_images = image_hashes(reference_path) if reference_path else {}
        candidate_images = image_hashes(candidate_path) if candidate_path else {}
        flags = []
        if reference_path is None or candidate_path is None:
            flags.append("missing_output")
        if reference_meta is None or candidate_meta is None:
            flags.append("metadata_invalid")
        if isinstance(reference_pages, list) and isinstance(candidate_pages, list) and len(reference_pages) != len(candidate_pages):
            flags.append("page_count_mismatch")
        if structure(reference_raw) != structure(candidate_raw):
            flags.append("structure_delta")
        if reference_images != candidate_images:
            flags.append("image_delta")
        similarity = difflib.SequenceMatcher(None, reference, candidate, autojunk=False).ratio()
        if similarity < 0.95:
            flags.append("text_similarity_low")
        if candidate and len(candidate) < max(80, len(reference) * 0.5):
            flags.append("suspicious_length")
        records.append(
            {
                "file": name,
                "referencePresent": reference_path is not None,
                "candidatePresent": candidate_path is not None,
                "exactNormalizedMatch": reference == candidate,
                "similarity": round(similarity, 6),
                "referenceChars": len(reference),
                "candidateChars": len(candidate),
                "referenceSha256": sha256_bytes(reference.encode()),
                "candidateSha256": sha256_bytes(candidate.encode()),
                "referenceStructure": structure(reference_raw),
                "candidateStructure": structure(candidate_raw),
                "referencePageCount": len(reference_pages) if isinstance(reference_pages, list) else None,
                "candidatePageCount": len(candidate_pages) if isinstance(candidate_pages, list) else None,
                "referenceImageCount": len(reference_images),
                "candidateImageCount": len(candidate_images),
                "flags": flags,
                "manualReviewRequired": bool(flags),
            }
        )
    return {
        "schemaVersion": 2,
        "files": len(records),
        "exactMatches": sum(record["exactNormalizedMatch"] for record in records),
        "manualReviewFiles": sum(record["manualReviewRequired"] for record in records),
        "meanSimilarity": round(sum(record["similarity"] for record in records) / len(records), 6) if records else 0,
        "results": records,
    }


def main():
    parser = argparse.ArgumentParser(description="Compare Marker baseline and candidate outputs")
    parser.add_argument("reference_dir", type=Path)
    parser.add_argument("candidate_dir", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = compare(args.reference_dir, args.candidate_dir)
    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
