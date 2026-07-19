#!/usr/bin/env python3
import argparse
import hashlib
import importlib.metadata
import json
import multiprocessing
import os
import platform
import queue
import re
import subprocess
import sys
import tempfile
import time
import tarfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
HOSTED_VISION_PROVIDERS = {
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "openrouter-siliconflow": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "siliconflow": ("https://api.siliconflow.com/v1", "SILICONFLOW_API_KEY"),
}
IMAGE_REF = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
ARTIFACTS = None
PROFILE = None
HARNESS_FILES = [
    "infra/marker/benchmark-matrix.json",
    "infra/marker/benchmark-userdata.sh",
    "infra/marker/qwen3.5-4b-vllm-manifest.json",
    "infra/marker/qwen3.5-9b-vllm-manifest.json",
    "infra/marker/profiles/academic-enhanced-local.json",
    "infra/marker/profiles/academic-enhanced-local-9b.json",
    "infra/marker/profiles/academic-enhanced-hosted.json",
    "infra/marker/profiles/academic-enhanced-hosted-control.json",
    "infra/marker/profiles/conservative.json",
    "infra/marker/profiles/fast-born-digital.json",
    "infra/marker/profiles/released-default.json",
    "oghma_marker/__init__.py",
    "oghma_marker/services.py",
    "scripts/marker-aws-session.py",
    "scripts/marker-bench-artifacts.py",
    "scripts/marker-bench-collect.sh",
    "scripts/marker-bench-download.mjs",
    "scripts/marker-bench-finalize.sh",
    "scripts/marker-bench-prepare-instance.sh",
    "scripts/marker-bench-python.sh",
    "scripts/marker-bench-run.sh",
    "scripts/marker-bench-telemetry.py",
    "scripts/marker-bench.py",
    "scripts/e2e/fixtures/sample-paper.pdf",
]


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def append_jsonl(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n")
    os.chmod(path, 0o600)


def canonical_sha256(value):
    payload = json.dumps(value, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(payload).hexdigest()


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_hosted_vision_target(profile, require_key=False):
    configured = profile.get("llm_target")
    if not configured:
        return None
    target = os.environ.get("MARKER_VISION_TARGET", configured)
    provider, separator, model = target.partition(":")
    if not separator or not model or provider not in HOSTED_VISION_PROVIDERS:
        raise ValueError("invalid MARKER_VISION_TARGET provider or model")
    endpoint, key_environment = HOSTED_VISION_PROVIDERS[provider]
    if require_key and not os.environ.get(key_environment):
        raise ValueError(f"{key_environment} is required for {provider}")
    return {
        "target": target,
        "provider": provider,
        "model": model,
        "endpoint": endpoint,
        "credentialEnvironment": key_environment,
    }


def page_count(path):
    try:
        import pypdfium2

        document = pypdfium2.PdfDocument(str(path))
        try:
            return len(document)
        finally:
            document.close()
    except ImportError:
        try:
            from pypdf import PdfReader

            return len(PdfReader(str(path)).pages)
        except ImportError:
            result = subprocess.run(
                ["pdfinfo", str(path)],
                check=True,
                capture_output=True,
                text=True,
            )
            match = re.search(r"^Pages:\s+(\d+)\s*$", result.stdout, re.MULTILINE)
            if not match:
                raise ValueError("unable to determine PDF page count")
            return int(match.group(1))


def parse_page_range(value):
    if value is None:
        return None
    pages = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        if "-" in item:
            start_text, end_text = item.split("-", 1)
            start, end = int(start_text), int(end_text)
            if start < 0 or end < start:
                raise ValueError(f"invalid page range: {value}")
            pages.extend(range(start, end + 1))
        else:
            page = int(item)
            if page < 0:
                raise ValueError(f"invalid page range: {value}")
            pages.append(page)
    return sorted(set(pages))


def effective_page_count(total, page_range):
    if page_range is None:
        return total
    return sum(page < total for page in page_range)


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def validate_matrix(matrix):
    if matrix.get("schemaVersion") != 2 or matrix.get("mode") != "batch":
        raise ValueError("benchmark matrix must use batch schema version 2")
    candidates = matrix.get("candidates")
    passes = matrix.get("passes")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("matrix requires candidates")
    if not isinstance(passes, list) or not passes:
        raise ValueError("matrix requires passes")
    seen = set()
    for candidate in candidates:
        candidate_id = candidate.get("id", "")
        if not SAFE_ID.fullmatch(candidate_id) or candidate_id in seen:
            raise ValueError(f"invalid or duplicate candidate id: {candidate_id}")
        seen.add(candidate_id)
        workers = candidate.get("workerCounts")
        if not isinstance(workers, list) or not workers or any(not isinstance(x, int) or x < 1 for x in workers):
            raise ValueError(f"invalid worker counts for {candidate_id}")
        profile_path = REPO_ROOT / candidate.get("profileConfig", "")
        if not profile_path.is_file():
            raise ValueError(f"missing profile config for {candidate_id}: {profile_path}")
        expected_profile_hash = candidate.get("profileSha256")
        if not re.fullmatch(r"[0-9a-f]{64}", str(expected_profile_hash or "")):
            raise ValueError(f"missing profile hash for {candidate_id}")
        if file_sha256(profile_path) != expected_profile_hash:
            raise ValueError(f"profile hash mismatch for {candidate_id}")
        candidate_passes = candidate.get("passOverrides")
        if candidate_passes is not None:
            validate_passes(candidate_passes)
        serving_path = candidate.get("servingManifest")
        if serving_path:
            validate_serving_manifest(
                REPO_ROOT / serving_path,
                candidate.get("servingManifestFingerprint"),
                load_json(profile_path),
            )
    validate_passes(passes)
    return validate_stop_conditions(matrix)


def validate_passes(passes):
    pass_names = set()
    for benchmark_pass in passes:
        name = benchmark_pass.get("name", "")
        if not SAFE_ID.fullmatch(name) or name in pass_names:
            raise ValueError(f"invalid or duplicate pass name: {name}")
        pass_names.add(name)
        if not isinstance(benchmark_pass.get("repeats"), int) or benchmark_pass["repeats"] < 1:
            raise ValueError(f"invalid repeats for pass {name}")
        parse_page_range(benchmark_pass.get("pageRange"))
    return passes


def validate_serving_manifest(path, approved_fingerprint, profile=None):
    manifest = load_json(path)
    if manifest.get("schemaVersion") != 1:
        raise ValueError("invalid serving manifest schema")
    if canonical_sha256(manifest) != approved_fingerprint:
        raise ValueError("serving manifest fingerprint mismatch")
    model, engine, limits, runtime = (manifest.get(key, {}) for key in ("model", "engine", "limits", "runtime"))
    hashes = ("configSha256", "tokenizerConfigSha256", "preprocessorConfigSha256")
    if not re.fullmatch(r"[0-9a-f]{40}", str(model.get("revision", ""))):
        raise ValueError("model revision is not pinned")
    if any(not re.fullmatch(r"[0-9a-f]{64}", str(model.get(key, ""))) for key in hashes):
        raise ValueError("model configuration hashes are incomplete")
    if engine.get("name") not in {"vllm", "sglang"} or not re.fullmatch(r"[0-9a-f]{40}", str(engine.get("revision", ""))):
        raise ValueError("serving engine revision is not pinned")
    if not all(key in engine for key in ("version", "torchVersion", "cudaVersion")):
        raise ValueError("serving engine software versions are incomplete")
    if not all(isinstance(limits.get(key), int) and limits[key] > 0 for key in ("maxModelContext", "maxImageWidth", "maxImageHeight", "maxImagePixels", "maxImagesPerPrompt")):
        raise ValueError("serving limits are incomplete")
    if runtime.get("host") not in {"127.0.0.1", "localhost"}:
        raise ValueError("serving endpoint must be loopback-only")
    if not isinstance(runtime.get("command"), list) or not runtime["command"]:
        raise ValueError("server command is missing")
    if profile:
        if profile.get("llm_model") != model.get("id") or profile.get("llm_approved_model") != model.get("id"):
            raise ValueError("profile and approved model disagree")
        if bool(profile.get("llm_thinking")) != bool(runtime.get("thinking")):
            raise ValueError("profile and serving thinking settings disagree")
    return manifest


def validate_runtime_identity(manifest):
    engine = manifest["engine"]
    if importlib.metadata.version(engine["name"]) != engine["version"]:
        raise ValueError("serving-engine revision differs from approved manifest")
    import torch
    if torch.__version__.split("+")[0] != engine["torchVersion"] or str(torch.version.cuda) != engine["cudaVersion"]:
        raise ValueError("Torch or CUDA differs from approved manifest")
    return True


def effective_passes(matrix, candidate):
    return candidate.get("passOverrides") or matrix["passes"]


def validate_stop_conditions(matrix):
    stop = matrix.get("stopConditions", {})
    required = [
        "maxDocumentFailures",
        "maxCudaOomEvents",
        "documentTimeoutSeconds",
        "gpuIdleUtilizationPercent",
        "maxQueuedGpuIdleSeconds",
    ]
    if any(key not in stop for key in required):
        raise ValueError("matrix stop conditions are incomplete")
    return matrix


def find_candidate(matrix, candidate_id, allow_disabled=False):
    candidate = next((item for item in matrix["candidates"] if item["id"] == candidate_id), None)
    if candidate is None:
        raise ValueError(f"unknown candidate: {candidate_id}")
    if not candidate.get("enabled", False) and not allow_disabled:
        raise ValueError(f"candidate requires explicit approval: {candidate_id}")
    return candidate


def attest_corpus(corpus, output):
    corpus = Path(corpus).resolve()
    files = sorted(corpus.glob("*.pdf"))
    if not files:
        raise ValueError(f"no PDFs found in {corpus}")
    documents = []
    for ordinal, path in enumerate(files, start=1):
        documents.append(
            {
                "ordinal": ordinal,
                "file": f"pdf-{ordinal:03d}.pdf",
                "bytes": path.stat().st_size,
                "sha256": file_sha256(path),
                "pages": page_count(path),
                "classes": [],
            }
        )
    attestation = {
        "schemaVersion": 1,
        "documents": documents,
        "fingerprint": canonical_sha256(documents),
    }
    write_json(output, attestation)
    print(json.dumps({"documents": len(documents), "pages": sum(x["pages"] for x in documents), "fingerprint": attestation["fingerprint"]}, indent=2))


def verify_corpus(corpus, attestation):
    corpus = Path(corpus).resolve()
    data = load_json(attestation)
    documents = data.get("documents")
    if data.get("schemaVersion") != 1 or not isinstance(documents, list) or not documents:
        raise ValueError("invalid corpus attestation")
    if canonical_sha256(documents) != data.get("fingerprint"):
        raise ValueError("corpus attestation fingerprint mismatch")
    verified = []
    for expected in documents:
        ordinal = expected.get("ordinal")
        name = expected.get("file")
        if name != f"pdf-{ordinal:03d}.pdf":
            raise ValueError(f"invalid opaque corpus name at ordinal {ordinal}")
        path = corpus / name
        if not path.is_file():
            raise ValueError(f"missing corpus file at ordinal {ordinal}")
        actual = {
            "bytes": path.stat().st_size,
            "sha256": file_sha256(path),
            "pages": page_count(path),
        }
        for field, value in actual.items():
            if value != expected.get(field):
                raise ValueError(f"corpus {field} mismatch at ordinal {ordinal}")
        verified.append({**expected, "path": str(path)})
    expected_names = {item["file"] for item in documents}
    actual_names = {path.name for path in corpus.glob("*.pdf")}
    if actual_names != expected_names:
        raise ValueError("corpus contains unexpected or missing PDFs")
    return data, verified


def validate_build_manifest(path, expected_revision):
    manifest = load_json(path)
    if manifest.get("schemaVersion") != 1 or manifest.get("commit") != expected_revision:
        raise ValueError("build manifest does not match the selected source revision")
    for key in ("tree", "poetryLockSha256", "archiveSha256"):
        if not re.fullmatch(r"[0-9a-f]{40}" if key == "tree" else r"[0-9a-f]{64}", str(manifest.get(key, ""))):
            raise ValueError(f"build manifest has invalid {key}")
    return manifest


def validate_installed_marker_build(expected_archive_sha256):
    try:
        distribution = importlib.metadata.distribution("marker-pdf")
        direct = json.loads(distribution.read_text("direct_url.json") or "{}")
    except (importlib.metadata.PackageNotFoundError, json.JSONDecodeError):
        raise ValueError("installed marker-pdf has no verifiable direct archive identity")
    recorded = direct.get("archive_info", {}).get("hash", "")
    if recorded != f"sha256={expected_archive_sha256}":
        raise ValueError("installed marker-pdf does not match the approved package archive")


def package_harness(output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    files = [{"path": relative, "sha256": file_sha256(REPO_ROOT / relative)} for relative in HARNESS_FILES]
    harness_sha = canonical_sha256(files)
    with tarfile.open(output, "w:gz", format=tarfile.PAX_FORMAT) as archive:
        for record in files:
            archive.add(REPO_ROOT / record["path"], arcname=record["path"], recursive=False)
    manifest = {"schemaVersion": 1, "files": files, "harnessSha256": harness_sha, "archiveSha256": file_sha256(output)}
    write_json(f"{output}.manifest.json", manifest)
    Path(f"{output}.sha256").write_text(f"{manifest['archiveSha256']}  {output.name}\n", encoding="utf-8")
    os.chmod(output, 0o600)
    os.chmod(f"{output}.sha256", 0o600)
    return manifest


def validate_harness_manifest(path, approved_sha=None):
    manifest = load_json(path)
    files = manifest.get("files")
    if manifest.get("schemaVersion") != 1 or not isinstance(files, list):
        raise ValueError("invalid harness manifest")
    if canonical_sha256(files) != manifest.get("harnessSha256"):
        raise ValueError("harness manifest fingerprint mismatch")
    if approved_sha and manifest["harnessSha256"] != approved_sha:
        raise ValueError("harness is not the approved build")
    expected_paths = set(HARNESS_FILES)
    if {record.get("path") for record in files} != expected_paths:
        raise ValueError("harness manifest allowlist mismatch")
    for record in files:
        path = REPO_ROOT / record["path"]
        if not path.is_file() or file_sha256(path) != record.get("sha256"):
            raise ValueError(f"transferred harness mismatch: {record.get('path')}")
    return manifest


def validate_image_references(markdown, output_dir):
    invalid = []
    references = []
    for raw in IMAGE_REF.findall(markdown):
        reference = raw.strip().split(maxsplit=1)[0].strip("<>")
        references.append(reference)
        if re.match(r"^[a-z][a-z0-9+.-]*://", reference, re.IGNORECASE) or reference.startswith("//"):
            invalid.append(reference)
            continue
        target = (Path(output_dir) / reference).resolve()
        try:
            target.relative_to(Path(output_dir).resolve())
        except ValueError:
            invalid.append(reference)
            continue
        if not target.is_file():
            invalid.append(reference)
    return references, invalid


def sum_numeric_metadata(value, key):
    if isinstance(value, dict):
        own = value.get(key, 0)
        total = own if isinstance(own, (int, float)) and not isinstance(own, bool) else 0
        return total + sum(sum_numeric_metadata(item, key) for item_key, item in value.items() if item_key != key)
    if isinstance(value, list):
        return sum(sum_numeric_metadata(item, key) for item in value)
    return 0


def _make_converter(config):
    from marker.converters.pdf import PdfConverter

    converter_config = dict(config)
    llm_service = converter_config.pop("llm_service", None)
    kwargs = {"config": converter_config, "artifact_dict": ARTIFACTS}
    if llm_service:
        kwargs["llm_service"] = llm_service
    try:
        return PdfConverter(**kwargs)
    except TypeError:
        kwargs["model_dict"] = kwargs.pop("artifact_dict")
        return PdfConverter(**kwargs)


def _worker_init(profile, warmup_fixture, ready_queue):
    global ARTIFACTS, PROFILE
    try:
        os.environ["MARKER_PROFILE"] = "0"
        os.environ["MARKER_PROFILE_LOG_EVENTS"] = "0"
        if profile.get("__test_adapter"):
            PROFILE = profile
            ARTIFACTS = {}
            ready_queue.put({"pid": os.getpid(), "ok": True})
            return
        from marker.models import create_model_dict

        PROFILE = profile
        ARTIFACTS = create_model_dict()
        if warmup_fixture:
            warmup_config = dict(PROFILE)
            warmup_config.pop("page_range", None)
            warmup_config.pop("llm_service", None)
            warmup_config.update(
                {
                    "use_llm": False,
                    "describe_extracted_images": False,
                    "redo_inline_math": False,
                    "profile_marker": False,
                    "debug_pdf_images": False,
                    "debug_layout_images": False,
                    "debug_json": False,
                }
            )
            converter = _make_converter(warmup_config)
            converter(str(warmup_fixture))
        ready_queue.put({"pid": os.getpid(), "ok": True})
    except BaseException as exc:
        ready_queue.put({"pid": os.getpid(), "ok": False, "errorType": exc.__class__.__name__})
        raise


def _worker_process(task):
    started = time.monotonic()
    ordinal = task["ordinal"]
    output_dir = Path(task["outputDir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    config = dict(PROFILE)
    diagnostic = bool(task.get("diagnostic"))
    stage_profile = bool(task.get("stageProfile")) or diagnostic
    config["profile_marker"] = stage_profile
    config["profile_marker_log_events"] = False
    config["profile_marker_cuda_sync"] = stage_profile
    if diagnostic:
        config.update(
            {
                "debug_data_folder": str(output_dir / "diagnostic"),
                "debug_pdf_images": True,
                "debug_layout_images": True,
                "debug_json": True,
                "profile_marker_cuda_sync": True,
                "diagnostic_snapshots": True,
                "diagnostic_snapshot_folder": str(output_dir / "diagnostic" / "intermediate"),
            }
        )
    if task["pageRange"] is not None:
        config["page_range"] = task["pageRange"]
    base_name = f"pdf-{ordinal:03d}"
    record = {
        "ordinal": ordinal,
        "expectedPages": task["expectedPages"],
        "success": False,
        "valid": False,
        "errorCategory": None,
        "errorType": None,
    }
    try:
        if PROFILE.get("__test_adapter"):
            now = time.time()
            markdown_path = output_dir / f"{base_name}.md"
            metadata_path = output_dir / f"{base_name}_meta.json"
            markdown_path.write_text(f"# Synthetic document {ordinal}\n\nValidated fake adapter output.\n", encoding="utf-8")
            write_json(metadata_path, {"page_stats": [{"page_id": page} for page in range(task["expectedPages"])]})
            if diagnostic:
                debug = output_dir / "diagnostic" / "intermediate" / "post-all-processors" / base_name
                debug.mkdir(parents=True, exist_ok=True)
                (debug / "pdf_page_0.png").write_bytes(b"synthetic-png")
                write_json(debug / "blocks.json", [])
            record.update(
                {
                    "success": True, "valid": True, "producedPages": task["expectedPages"],
                    "outputChars": markdown_path.stat().st_size, "imageCount": 0,
                    "imageReferenceCount": 0, "invalidImageReferenceCount": 0,
                    "manualReview": False, "diagnostic": diagnostic,
                    "rankingEligible": False,
                    "stageEvents": ([{"run_id": "synthetic", "stage": "synthetic.stage", "elapsed_seconds": 0.01, "status": "ok", "started_epoch_seconds": now, "ended_epoch_seconds": now + 0.01, "started_monotonic_seconds": started, "ended_monotonic_seconds": started + 0.01, "cuda_synchronized": stage_profile}] if stage_profile else []),
                }
            )
            if PROFILE.get("use_llm"):
                if PROFILE.get("__test_llm_mode") == "zero":
                    record.update(valid=False, errorCategory="llm_required_but_unused", llmRequestCount=0, llmTokensUsed=0)
                else:
                    record.update(
                        llmRequestCount=1,
                        llmTokensUsed=10,
                        llmAccounting={
                            "attempts": 1, "successfulRequests": 1, "failedRequests": 0,
                            "inputTokens": 7, "outputTokens": 3,
                            "records": [{
                                "success": True, "latencySeconds": 0.01,
                                "model": PROFILE.get("llm_model"), "endpointType": "chat.completions",
                                "inputTokens": 7, "outputTokens": 3,
                            }],
                        },
                    )
            record["latencySeconds"] = round(time.monotonic() - started, 6)
            return record
        from marker.output import save_output

        converter = _make_converter(config)
        rendered = converter(task["inputPath"])
        save_output(rendered, str(output_dir), base_name)
        markdown_path = output_dir / f"{base_name}.md"
        metadata_path = output_dir / f"{base_name}_meta.json"
        markdown = markdown_path.read_text(encoding="utf-8", errors="replace") if markdown_path.is_file() else ""
        metadata = load_json(metadata_path) if metadata_path.is_file() else None
        page_stats = metadata.get("page_stats") if isinstance(metadata, dict) else None
        references, invalid_references = validate_image_references(markdown, output_dir)
        produced_pages = converter.page_count
        valid = (
            produced_pages == task["expectedPages"]
            and bool(markdown.strip())
            and isinstance(page_stats, list)
            and len(page_stats) == task["expectedPages"]
            and not invalid_references
        )
        service = getattr(converter, "llm_service", None)
        llm_accounting = (
            service.accounting_snapshot()
            if service is not None and hasattr(service, "accounting_snapshot")
            else None
        )
        metadata_requests = int(sum_numeric_metadata(metadata, "llm_request_count"))
        metadata_tokens = int(sum_numeric_metadata(metadata, "llm_tokens_used"))
        if PROFILE.get("use_llm"):
            if not llm_accounting or llm_accounting["successfulRequests"] < 1:
                valid = False
                record["errorCategory"] = "llm_required_but_unused"
            elif metadata_requests != llm_accounting["successfulRequests"] or metadata_tokens != (
                llm_accounting["inputTokens"] + llm_accounting["outputTokens"]
            ):
                valid = False
                record["errorCategory"] = "llm_accounting_mismatch"
        record.update(
            {
                "success": True,
                "valid": valid,
                "producedPages": produced_pages,
                "outputChars": len(markdown),
                "imageCount": len(getattr(rendered, "images", {}) or {}),
                    "imageReferenceCount": len(references),
                    "invalidImageReferenceCount": len(invalid_references),
                    "llmRequestCount": metadata_requests,
                    "llmTokensUsed": metadata_tokens,
                    "llmAccounting": llm_accounting,
                "manualReview": len(markdown.strip()) < max(80, task["expectedPages"] * 40),
                "diagnostic": diagnostic,
                "rankingEligible": not diagnostic,
                "stageEvents": list(getattr(converter, "profile_events", [])) if stage_profile else [],
            }
        )
        if not valid and not record.get("errorCategory"):
            record["errorCategory"] = "invalid_output"
    except BaseException as exc:
        message = str(exc).lower()
        record["errorType"] = exc.__class__.__name__
        safe_category = getattr(exc, "category", None)
        record["errorCategory"] = (
            safe_category if safe_category in {
                "llm_http_error", "llm_timeout", "llm_schema_error",
                "llm_empty_response", "llm_model_mismatch",
            } else "cuda_oom" if "cuda" in message and "out of memory" in message else "conversion_error"
        )
    record["latencySeconds"] = round(time.monotonic() - started, 6)
    return record


class TelemetryMonitor:
    def __init__(self, path, idle_threshold):
        self.path = Path(path)
        self.offset = 0
        self.initial_oom = None
        self.current_oom = None
        self.idle_seconds = 0.0
        self.idle_threshold = idle_threshold

    def poll(self):
        if not self.path.is_file():
            return
        with self.path.open("r", encoding="utf-8", errors="replace") as stream:
            stream.seek(self.offset)
            for line in stream:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                oom = record.get("oom_kill_count")
                if isinstance(oom, int):
                    if self.initial_oom is None:
                        self.initial_oom = oom
                    self.current_oom = oom
                gpu = record.get("gpu_util_percent")
                elapsed = record.get("sample_elapsed_seconds", 1)
                if isinstance(gpu, (int, float)) and gpu <= self.idle_threshold:
                    self.idle_seconds += max(0, float(elapsed))
                else:
                    self.idle_seconds = 0.0
            self.offset = stream.tell()

    @property
    def system_oom(self):
        return self.initial_oom is not None and self.current_oom is not None and self.current_oom > self.initial_oom


def start_telemetry(directory, interval_seconds=1.0, worker_pids=()):
    telemetry_path = Path(directory) / "telemetry.jsonl"
    log_path = Path(directory) / "telemetry.log"
    environment = os.environ.copy()
    environment.setdefault("MARKER_TELEMETRY_MODE", "gpu")
    environment["MARKER_TELEMETRY_INTERVAL_SECONDS"] = str(interval_seconds)
    environment["MARKER_BENCH_WORKER_PIDS"] = ",".join(str(pid) for pid in worker_pids)
    log_stream = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [sys.executable, str(REPO_ROOT / "scripts/marker-bench-telemetry.py"), str(telemetry_path)],
        stdout=log_stream,
        stderr=subprocess.STDOUT,
        env=environment,
    )
    return process, log_stream, telemetry_path


def wait_for_workers(ready_queue, workers, timeout):
    ready = set()
    deadline = time.monotonic() + timeout
    while len(ready) < workers:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("workers did not finish loading models and warming up")
        try:
            result = ready_queue.get(timeout=min(5, remaining))
        except queue.Empty:
            continue
        if not result.get("ok"):
            raise RuntimeError(f"worker setup failed: {result.get('errorType', 'unknown')}")
        ready.add(result["pid"])
    return sorted(ready)


def summarize_repeat(records, duration, hourly_rate, abort_reason):
    valid = [record for record in records if record.get("valid")]
    latencies = [record["latencySeconds"] for record in valid]
    successful_pages = sum(record["expectedPages"] for record in valid)
    cost = hourly_rate * duration / 3600
    return {
        "documents": len(records),
        "validDocuments": len(valid),
        "successfulPages": successful_pages,
        "failedOrInvalidDocuments": len(records) - len(valid),
        "manualReviewDocuments": sum(bool(record.get("manualReview")) for record in records),
        "llmRequestCount": sum(record.get("llmRequestCount", 0) for record in records),
        "llmTokensUsed": sum(record.get("llmTokensUsed", 0) for record in records),
        "durationSeconds": round(duration, 6),
        "latencyP50Seconds": round(percentile(latencies, 0.5), 6) if latencies else None,
        "latencyP95Seconds": round(percentile(latencies, 0.95), 6) if latencies else None,
        "pagesPerSecond": round(successful_pages / duration, 6) if duration > 0 else None,
        "cellComputeCostUsd": round(cost, 6),
        "computeUsdPer1000SuccessfulPages": round(cost / successful_pages * 1000, 6) if successful_pages else None,
        "abortReason": abort_reason,
        "healthy": abort_reason is None and len(valid) == len(records),
    }


def summarize_stage_events(records):
    totals = Counter()
    counts = Counter()
    errors = Counter()
    for record in records:
        for event in record.get("stageEvents", []):
            stage = event.get("stage")
            elapsed = event.get("elapsed_seconds")
            if not isinstance(stage, str) or not isinstance(elapsed, (int, float)):
                continue
            totals[stage] += elapsed
            counts[stage] += 1
            if event.get("status") != "ok":
                errors[stage] += 1
    return [
        {
            "stage": stage,
            "count": counts[stage],
            "hostWallSeconds": round(totals[stage], 6),
            "averageHostWallSeconds": round(totals[stage] / counts[stage], 6),
            "errors": errors[stage],
        }
        for stage in sorted(totals, key=totals.get, reverse=True)
    ]


def summarize_telemetry(path):
    samples = []
    if Path(path).is_file():
        for line in Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                samples.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    cpu = [row["marker_cpu_percent"] for row in samples if isinstance(row.get("marker_cpu_percent"), (int, float))]
    gpu = [row["gpu_util_percent"] for row in samples if isinstance(row.get("gpu_util_percent"), (int, float))]
    vram = [row["vram_used_mib"] for row in samples if isinstance(row.get("vram_used_mib"), (int, float))]
    paired = [row for row in samples if isinstance(row.get("marker_cpu_percent"), (int, float)) and isinstance(row.get("gpu_util_percent"), (int, float))]
    return {
        "samples": len(samples),
        "markerCpuMeanPercent": round(sum(cpu) / len(cpu), 3) if cpu else None,
        "markerCpuP95Percent": round(percentile(cpu, 0.95), 3) if cpu else None,
        "gpuMeanPercent": round(sum(gpu) / len(gpu), 3) if gpu else None,
        "gpuP95Percent": round(percentile(gpu, 0.95), 3) if gpu else None,
        "peakVramMiB": max(vram) if vram else None,
        "cpuGpuBusySamples": sum(row["marker_cpu_percent"] >= 25 and row["gpu_util_percent"] >= 25 for row in paired),
        "gpuIdleCpuBusySamples": sum(row["marker_cpu_percent"] >= 25 and row["gpu_util_percent"] <= 5 for row in paired),
        "cpuGpuBusyFraction": round(sum(row["marker_cpu_percent"] >= 25 and row["gpu_util_percent"] >= 25 for row in paired) / len(paired), 6) if paired else None,
    }


def summarize_stage_resources(records, telemetry_path):
    samples = []
    if Path(telemetry_path).is_file():
        for line in Path(telemetry_path).read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                row = json.loads(line)
                row["epoch"] = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")).timestamp()
                samples.append(row)
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
    grouped = {}
    for record in records:
        for event in record.get("stageEvents", []):
            start, end = event.get("started_epoch_seconds"), event.get("ended_epoch_seconds")
            stage = event.get("stage")
            if not isinstance(stage, str) or not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
                continue
            matched = [row for row in samples if start <= row["epoch"] <= end]
            aggregate = grouped.setdefault(stage, {"events": 0, "matchedSamples": 0, "markerCpu": [], "gpu": [], "vram": [], "markerRss": []})
            aggregate["events"] += 1
            aggregate["matchedSamples"] += len(matched)
            for row in matched:
                for key, target in (("marker_cpu_percent", "markerCpu"), ("gpu_util_percent", "gpu"), ("vram_used_mib", "vram"), ("marker_rss_mib", "markerRss")):
                    if isinstance(row.get(key), (int, float)):
                        aggregate[target].append(row[key])
    return [
        {
            "stage": stage,
            "events": value["events"],
            "matchedTelemetrySamples": value["matchedSamples"],
            "markerCpuMeanPercent": round(sum(value["markerCpu"]) / len(value["markerCpu"]), 3) if value["markerCpu"] else None,
            "gpuMeanPercent": round(sum(value["gpu"]) / len(value["gpu"]), 3) if value["gpu"] else None,
            "peakVramMiB": max(value["vram"]) if value["vram"] else None,
            "peakMarkerRssMiB": max(value["markerRss"]) if value["markerRss"] else None,
        }
        for stage, value in sorted(grouped.items())
    ]


def run_repeat(args, candidate, profile, benchmark_pass, workers, repeat_index, documents, repeat_dir, deadline_epoch):
    repeat_dir.mkdir(parents=True, exist_ok=True)
    requests_path = repeat_dir / "requests.jsonl"
    requests_path.write_text("", encoding="utf-8")
    os.chmod(requests_path, 0o600)
    page_range = parse_page_range(benchmark_pass.get("pageRange"))
    ordered = documents[repeat_index - 1 :] + documents[: repeat_index - 1]
    tasks = []
    for document in ordered:
        expected_pages = effective_page_count(document["pages"], page_range)
        if expected_pages < 1:
            raise ValueError(f"preview selects no pages at ordinal {document['ordinal']}")
        tasks.append(
            {
                "ordinal": document["ordinal"],
                "inputPath": document["path"],
                "outputDir": str(repeat_dir / "output" / f"document-{document['ordinal']:03d}"),
                "pageRange": [page for page in page_range if page < document["pages"]] if page_range is not None else None,
                "expectedPages": expected_pages,
                "diagnostic": args.run_mode == "diagnostic",
                "stageProfile": args.stage_profile,
            }
        )
    write_json(repeat_dir / "repeat.json", {"repeat": repeat_index, "order": [item["ordinal"] for item in ordered]})
    context = multiprocessing.get_context("spawn")
    ready_queue = context.Queue()
    pool = context.Pool(
        processes=workers,
        initializer=_worker_init,
        initargs=(profile, str(args.warmup_fixture), ready_queue),
    )
    records = []
    abort_reason = None
    started = None
    telemetry = None
    telemetry_log = None
    pool_finalized = False
    try:
        worker_pids = wait_for_workers(ready_queue, workers, args.worker_startup_timeout_seconds)
        telemetry, telemetry_log, telemetry_path = start_telemetry(
            repeat_dir,
            0.25 if args.run_mode == "diagnostic" or args.stage_profile else 1.0,
            worker_pids,
        )
        monitor = TelemetryMonitor(
            telemetry_path,
            args.matrix_data["stopConditions"]["gpuIdleUtilizationPercent"],
        )
        started = time.monotonic()
        iterator = pool.imap_unordered(_worker_process, tasks, chunksize=1)
        last_result_at = started
        failures = 0
        cuda_ooms = 0
        while len(records) < len(tasks):
            try:
                record = iterator.next(timeout=1)
                records.append(record)
                append_jsonl(requests_path, record)
                last_result_at = time.monotonic()
                if not record.get("valid"):
                    failures += 1
                if record.get("errorCategory") == "cuda_oom":
                    cuda_ooms += 1
                print(
                    f"{candidate['id']} {benchmark_pass['name']} workers={workers} repeat={repeat_index} "
                    f"document={record['ordinal']} valid={str(record.get('valid', False)).lower()}",
                    flush=True,
                )
            except multiprocessing.TimeoutError:
                pass
            monitor.poll()
            now = time.monotonic()
            stop = args.matrix_data["stopConditions"]
            if telemetry.poll() is not None:
                abort_reason = "telemetry_stopped"
            elif failures >= stop["maxDocumentFailures"]:
                abort_reason = "document_failure_limit"
            elif cuda_ooms >= stop["maxCudaOomEvents"]:
                abort_reason = "cuda_oom_limit"
            elif stop.get("abortOnSystemOom") and monitor.system_oom:
                abort_reason = "system_oom"
            elif monitor.idle_seconds >= stop["maxQueuedGpuIdleSeconds"]:
                abort_reason = "gpu_idle_while_queued"
            elif now - last_result_at >= stop["documentTimeoutSeconds"]:
                abort_reason = "document_timeout"
            elif time.time() >= deadline_epoch - args.transfer_buffer_seconds:
                abort_reason = "transfer_buffer_reached"
            if abort_reason:
                break
        if abort_reason:
            pool.terminate()
        else:
            pool.close()
        pool_finalized = True
    except BaseException:
        if not pool_finalized:
            pool.terminate()
            pool_finalized = True
        raise
    finally:
        if not pool_finalized:
            pool.terminate()
        pool.join()
        if telemetry is not None:
            telemetry.terminate()
            try:
                telemetry.wait(timeout=10)
            except subprocess.TimeoutExpired:
                telemetry.kill()
                telemetry.wait()
        if telemetry_log is not None:
            telemetry_log.close()
    duration = max(0.000001, time.monotonic() - (started or time.monotonic()))
    summary = summarize_repeat(records, duration, args.hourly_rate_usd, abort_reason)
    summary.update(
        {
            "expectedDocuments": len(tasks),
            "unfinishedDocuments": len(tasks) - len(records),
            "candidate": candidate["id"],
            "profile": candidate["profile"],
            "pass": benchmark_pass["name"],
            "workers": workers,
            "repeat": repeat_index,
            "rankingEligible": args.run_mode == "decision" and not args.test_adapter,
            "stageProfile": summarize_stage_events(records) if args.run_mode == "diagnostic" or args.stage_profile else [],
            "stageResourceProfile": summarize_stage_resources(records, telemetry_path) if (args.run_mode == "diagnostic" or args.stage_profile) and telemetry is not None else [],
            "resourceOverlap": summarize_telemetry(telemetry_path) if telemetry is not None else {},
        }
    )
    write_json(repeat_dir / "summary.json", summary)
    print(json.dumps(summary, sort_keys=True), flush=True)
    return summary


def environment_manifest(candidate, profile, args, serving_manifest=None):
    packages = {}
    for name in ["marker-pdf", "torch", "surya-ocr", "pdftext", "pypdfium2", "transformers", "vllm", "sglang"]:
        try:
            packages[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            packages[name] = None
    try:
        import torch

        torch_info = {
            "version": torch.__version__,
            "cudaRuntime": torch.version.cuda,
            "cudaAvailable": torch.cuda.is_available(),
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
    except Exception as exc:
        torch_info = {"errorType": exc.__class__.__name__}
    try:
        driver = subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version,name", "--format=csv,noheader"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except Exception:
        driver = None
    harness_files = [
        Path(args.matrix).resolve(),
        REPO_ROOT / candidate["profileConfig"],
        REPO_ROOT / "scripts/marker-bench.py",
        REPO_ROOT / "scripts/marker-bench-telemetry.py",
    ]
    if candidate.get("servingManifest"):
        harness_files.append(REPO_ROOT / candidate["servingManifest"])
    harness = [{"path": str(path.relative_to(REPO_ROOT)), "sha256": file_sha256(path)} for path in harness_files]
    hosted_vision = resolve_hosted_vision_target(profile)
    return {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "candidate": candidate["id"],
        "sourceRevision": args.source_revision,
        "profileSha256": canonical_sha256(profile),
        "harnessSha256": canonical_sha256(harness),
        "harnessFiles": harness,
        "python": sys.version,
        "platform": platform.platform(),
        "packages": packages,
        "torch": torch_info,
        "nvidia": driver,
        "instanceType": args.instance_type,
        "region": args.region,
        "hourlyRateUsd": args.hourly_rate_usd,
        "servingManifest": serving_manifest,
        "servingConfigurationFingerprint": canonical_sha256(serving_manifest) if serving_manifest else None,
        "hostedVision": hosted_vision,
    }


def parse_deadline(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("deadline must include a timezone")
    return parsed.timestamp()


def run_benchmark(args):
    if args.run_mode == "decision" and os.environ.get("MARKER_PROFILE", "").lower() not in {"", "0", "false", "no"}:
        raise ValueError("decision runs refuse MARKER_PROFILE profiling")
    matrix = validate_matrix(load_json(args.matrix))
    harness_manifest = validate_harness_manifest(args.harness_manifest, args.approved_harness_sha256)
    args.matrix_data = matrix
    candidate = find_candidate(matrix, args.candidate, args.allow_disabled_candidate)
    profile = load_json(REPO_ROOT / candidate["profileConfig"])
    hosted_vision = resolve_hosted_vision_target(
        profile,
        require_key=not args.test_adapter and not args.dry_run,
    )
    serving_manifest = None
    if candidate.get("servingManifest"):
        serving_manifest = validate_serving_manifest(
            REPO_ROOT / candidate["servingManifest"],
            candidate["servingManifestFingerprint"],
            profile,
        )
    if args.test_adapter:
        if os.environ.get("MARKER_TELEMETRY_MODE") != "cpu":
            raise ValueError("the fake adapter is restricted to explicit CPU-only local verification")
        profile["__test_adapter"] = True
        profile["__test_llm_mode"] = os.environ.get("MARKER_TEST_LLM_MODE", "success")
    llm_enabled = bool(profile.get("use_llm") or profile.get("describe_extracted_images"))
    if llm_enabled and not args.allow_llm_benchmark:
        raise ValueError("LLM and image descriptions require --allow-llm-benchmark")
    if profile.get("describe_extracted_images") and not profile.get("use_llm"):
        raise ValueError("image descriptions require use_llm")
    if args.run_mode == "decision" and profile.get("profile_marker"):
        raise ValueError("decision profile must disable Marker profiling")
    if args.run_mode == "diagnostic" and candidate.get("implementation") != "marker-plus-plus":
        raise ValueError("diagnostic mode is restricted to the pinned Marker++ candidate")
    expected_revision = (
        candidate.get("diagnosticSourceRevision")
        if args.run_mode == "diagnostic"
        else candidate.get("sourceRevision")
    )
    if expected_revision and args.source_revision != expected_revision:
        raise ValueError(f"selected Marker++ source revision does not match the {args.run_mode} matrix identity")
    if expected_revision and not args.build_manifest:
        raise ValueError("Marker++ runs require the matching package build manifest")
    build_manifest = validate_build_manifest(args.build_manifest, expected_revision) if expected_revision else None
    if (serving_manifest or candidate.get("requiresVisionAdapter")) and build_manifest:
        integration_sha = build_manifest.get("repositoryIntegrationSha256")
        if integration_sha != file_sha256(REPO_ROOT / "oghma_marker/services.py"):
            raise ValueError("build manifest does not contain the approved repository vision adapter")
    if build_manifest and not args.test_adapter and not args.dry_run:
        validate_installed_marker_build(build_manifest["archiveSha256"])
    if serving_manifest and not args.test_adapter and not args.dry_run:
        validate_runtime_identity(serving_manifest)
    if hosted_vision and serving_manifest:
        raise ValueError("hosted vision candidates must not declare a local serving manifest")
    expected_version = candidate.get("expectedVersion")
    if expected_version:
        actual_version = importlib.metadata.version("marker-pdf")
        if actual_version != expected_version:
            raise ValueError(f"installed marker-pdf version is {actual_version}, expected {expected_version}")
    attestation, documents = verify_corpus(args.corpus, args.attestation)
    unclassified = [document["ordinal"] for document in attestation["documents"] if not document.get("classes")]
    if unclassified:
        raise ValueError("private corpus attestation must classify every document before a decision run")
    args.warmup_fixture = (REPO_ROOT / matrix["warmup"]["fixture"]).resolve()
    if not args.warmup_fixture.is_file():
        raise ValueError("warmup fixture is missing")
    deadline_epoch = parse_deadline(args.deadline_utc)
    if deadline_epoch - time.time() <= args.transfer_buffer_seconds:
        raise ValueError("deadline leaves no benchmark time before the transfer buffer")
    if not SAFE_ID.fullmatch(args.run_label):
        raise ValueError("run label must be a safe lowercase identifier")
    run_root = Path(args.results).resolve() / args.run_label / args.run_mode / candidate["id"]
    run_root.mkdir(parents=True, exist_ok=True)
    existing = [path for path in run_root.iterdir() if path.name != "runner.log"]
    if existing:
        raise ValueError("candidate result directory already contains benchmark data")
    os.chmod(run_root, 0o700)
    manifest = environment_manifest(candidate, profile, args, serving_manifest)
    if os.environ.get("MARKER_TELEMETRY_MODE", "gpu") != "cpu":
        if not manifest.get("nvidia") or not manifest.get("torch", {}).get("cudaAvailable"):
            raise ValueError("GPU decision run requires a working Nvidia driver and CUDA-enabled Torch")
    class_coverage = Counter(
        class_name
        for document in attestation["documents"]
        for class_name in document.get("classes", [])
    )
    manifest.update(
        {
            "matrixSha256": canonical_sha256(matrix),
            "corpusFingerprint": attestation["fingerprint"],
            "documents": len(documents),
            "pages": sum(item["pages"] for item in documents),
            "classCoverage": dict(sorted(class_coverage.items())),
            "deadlineUtc": args.deadline_utc,
            "transferBufferSeconds": args.transfer_buffer_seconds,
            "runMode": args.run_mode,
            "stageProfiling": args.stage_profile,
            "rankingEligible": args.run_mode == "decision" and not args.test_adapter,
            "llmEnabled": llm_enabled,
            "testAdapter": args.test_adapter,
            "diagnosticSemantics": (
                "host wall-time Marker stage events correlated with system telemetry; "
                "debug page/layout/block artifacts reflect the post-processor document state"
                if args.run_mode == "diagnostic"
                else None
            ),
            "diagnosticConfig": (
                {
                    "workers": 1,
                    "repeatsPerPass": 1,
                    "telemetryIntervalSeconds": 0.25,
                    "cudaSynchronizedStageBoundaries": True,
                    "snapshotsAfterBuilders": True,
                    "snapshotsAfterStructure": True,
                    "blockSnapshotAfterEveryProcessor": True,
                    "visualSnapshotAfterAllProcessors": True,
                }
                if args.run_mode == "diagnostic"
                else None
            ),
            "buildManifestSha256": file_sha256(args.build_manifest) if build_manifest else None,
            "buildTree": build_manifest.get("tree") if build_manifest else None,
            "buildArchiveSha256": build_manifest.get("archiveSha256") if build_manifest else None,
            "approvedHarnessSha256": harness_manifest["harnessSha256"],
        }
    )
    write_json(run_root / "run-manifest.json", manifest)
    write_json(run_root / "private" / "corpus-attestation.json", attestation)
    if args.dry_run:
        cells = []
        for benchmark_pass in effective_passes(matrix, candidate):
            for workers in ([1] if args.run_mode == "diagnostic" else candidate["workerCounts"]):
                for repeat in range(1, (1 if args.run_mode == "diagnostic" else benchmark_pass["repeats"]) + 1):
                    cells.append({"pass": benchmark_pass["name"], "workers": workers, "repeat": repeat})
        print(json.dumps({"candidate": candidate["id"], "cells": cells}, indent=2))
        return 0
    healthy_preview = {}
    failed = False
    blocked_workers = set()
    for matrix_pass in effective_passes(matrix, candidate):
        benchmark_pass = dict(matrix_pass)
        if args.run_mode == "diagnostic":
            benchmark_pass["repeats"] = 1
        worker_counts = [1] if args.run_mode == "diagnostic" else candidate["workerCounts"]
        for workers in worker_counts:
            if workers in blocked_workers:
                write_json(
                    run_root / benchmark_pass["name"] / f"workers-{workers}" / "skipped.json",
                    {"reason": "worker_escalation_stopped", "workers": workers, "pass": benchmark_pass["name"]},
                )
                continue
            if benchmark_pass.get("requiresHealthyPreview") and not healthy_preview.get(workers, False):
                write_json(
                    run_root / benchmark_pass["name"] / f"workers-{workers}" / "skipped.json",
                    {"reason": "preview_not_healthy", "workers": workers, "pass": benchmark_pass["name"]},
                )
                continue
            repeat_summaries = []
            for repeat in range(1, benchmark_pass["repeats"] + 1):
                if time.time() >= deadline_epoch - args.transfer_buffer_seconds:
                    write_json(
                        run_root / benchmark_pass["name"] / f"workers-{workers}" / f"repeat-{repeat}" / "skipped.json",
                        {"reason": "transfer_buffer_reached"},
                    )
                    failed = True
                    break
                repeat_dir = run_root / benchmark_pass["name"] / f"workers-{workers}" / f"repeat-{repeat}"
                summary = run_repeat(
                    args,
                    candidate,
                    profile,
                    benchmark_pass,
                    workers,
                    repeat,
                    documents,
                    repeat_dir,
                    deadline_epoch,
                )
                repeat_summaries.append(summary)
                if not summary["healthy"]:
                    failed = True
                    blocked_workers.update(count for count in worker_counts if count > workers)
                    break
            healthy = len(repeat_summaries) == benchmark_pass["repeats"] and all(item["healthy"] for item in repeat_summaries)
            if benchmark_pass["name"] == "preview":
                healthy_preview[workers] = healthy
    write_json(run_root / "complete.json", {"completedAt": datetime.now(timezone.utc).isoformat(), "healthy": not failed})
    return 1 if failed else 0


def build_parser():
    parser = argparse.ArgumentParser(description="Run and validate the Marker GPU benchmark")
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate = subparsers.add_parser("validate")
    validate.add_argument("--matrix", default=str(REPO_ROOT / "infra/marker/benchmark-matrix.json"))
    validate.add_argument("--candidate")
    validate.add_argument("--allow-disabled-candidate", action="store_true")
    attest = subparsers.add_parser("attest-corpus")
    attest.add_argument("corpus")
    attest.add_argument("output")
    package = subparsers.add_parser("package-harness")
    package.add_argument("output")
    for command, run_mode in (("run", "decision"), ("diagnostic", "diagnostic")):
        run = subparsers.add_parser(command)
        run.set_defaults(run_mode=run_mode)
        run.add_argument("corpus")
        run.add_argument("attestation")
        run.add_argument("results")
        run.add_argument("--matrix", default=str(REPO_ROOT / "infra/marker/benchmark-matrix.json"))
        run.add_argument("--candidate", required=True)
        run.add_argument("--source-revision")
        run.add_argument("--build-manifest")
        run.add_argument("--harness-manifest", required=True)
        run.add_argument("--approved-harness-sha256", required=True)
        run.add_argument("--run-label", required=True)
        run.add_argument("--instance-type", required=True)
        run.add_argument("--region", required=True)
        run.add_argument("--hourly-rate-usd", required=True, type=float)
        run.add_argument("--deadline-utc", required=True)
        run.add_argument("--transfer-buffer-seconds", type=int, default=900)
        run.add_argument("--worker-startup-timeout-seconds", type=int, default=1800)
        run.add_argument("--allow-disabled-candidate", action="store_true")
        run.add_argument("--allow-llm-benchmark", action="store_true")
        run.add_argument("--stage-profile", action="store_true")
        run.add_argument("--dry-run", action="store_true")
        run.add_argument("--test-adapter", action="store_true", help=argparse.SUPPRESS)
    return parser


def main():
    args = build_parser().parse_args()
    if args.command == "validate":
        matrix = validate_matrix(load_json(args.matrix))
        if args.candidate:
            find_candidate(matrix, args.candidate, args.allow_disabled_candidate)
        print(json.dumps({"schemaVersion": matrix["schemaVersion"], "candidates": len(matrix["candidates"]), "passes": len(matrix["passes"])}, indent=2))
        return 0
    if args.command == "attest-corpus":
        attest_corpus(args.corpus, args.output)
        return 0
    if args.command == "package-harness":
        print(json.dumps(package_harness(args.output), indent=2))
        return 0
    if args.command in {"run", "diagnostic"}:
        if args.hourly_rate_usd <= 0:
            raise ValueError("hourly rate must be positive")
        return run_benchmark(args)
    raise ValueError(f"unknown command: {args.command}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, TimeoutError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
