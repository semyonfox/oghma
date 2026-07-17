import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bench = load_module("marker_bench", ROOT / "scripts/marker-bench.py")
artifacts = load_module("marker_bench_artifacts", ROOT / "scripts/marker-bench-artifacts.py")
comparator = load_module("compare_marker_outputs", ROOT / "scripts/compare-marker-outputs.py")


class MatrixTests(unittest.TestCase):
    def test_matrix_and_profiles_validate(self):
        matrix = bench.load_json(ROOT / "infra/marker/benchmark-matrix.json")
        self.assertEqual(bench.validate_matrix(matrix)["schemaVersion"], 2)
        self.assertTrue(bench.find_candidate(matrix, "marker-release-1.10.2")["enabled"])
        with self.assertRaises(ValueError):
            bench.find_candidate(matrix, "marker-plus-plus-fast")

    def test_matrix_rejects_profile_drift(self):
        matrix = bench.load_json(ROOT / "infra/marker/benchmark-matrix.json")
        matrix["candidates"][0]["profileSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "profile hash mismatch"):
            bench.validate_matrix(matrix)

    def test_hosted_target_selects_provider_and_requires_only_named_key(self):
        profile = {"llm_target": "openrouter-siliconflow:qwen/qwen3.5-9b"}
        with patch.dict(os.environ, {}, clear=True):
            resolved = bench.resolve_hosted_vision_target(profile)
            self.assertEqual(resolved["provider"], "openrouter-siliconflow")
            self.assertEqual(resolved["endpoint"], "https://openrouter.ai/api/v1")
            self.assertNotIn("apiKey", resolved)
            with self.assertRaisesRegex(ValueError, "OPENROUTER_API_KEY"):
                bench.resolve_hosted_vision_target(profile, require_key=True)
        with patch.dict(os.environ, {
            "MARKER_VISION_TARGET": "siliconflow:Qwen/Qwen3.5-9B",
            "SILICONFLOW_API_KEY": "private-key",
        }, clear=True):
            resolved = bench.resolve_hosted_vision_target(profile, require_key=True)
            self.assertEqual(resolved["provider"], "siliconflow")
            self.assertNotIn("private-key", json.dumps(resolved))

    def test_page_ranges_and_percentiles(self):
        self.assertEqual(bench.parse_page_range("0-2,4"), [0, 1, 2, 4])
        self.assertEqual(bench.effective_page_count(2, [0, 1, 2]), 2)
        self.assertEqual(bench.percentile([1, 2, 3, 4], 0.5), 2.5)
        self.assertAlmostEqual(bench.percentile([1, 2, 3, 4], 0.95), 3.85)

    def test_image_reference_validation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "image.jpg").write_bytes(b"image")
            references, invalid = bench.validate_image_references(
                "![ok](image.jpg)\n![bad](../outside.jpg)\n![remote](https://example.com/x.png)",
                root,
            )
            self.assertEqual(len(references), 3)
            self.assertEqual(len(invalid), 2)

    def test_summary_counts_only_valid_pages(self):
        records = [
            {"valid": True, "expectedPages": 3, "latencySeconds": 1, "manualReview": False},
            {"valid": False, "expectedPages": 3, "latencySeconds": 2, "manualReview": True},
        ]
        summary = bench.summarize_repeat(records, 4, 1.0, None)
        self.assertEqual(summary["successfulPages"], 3)
        self.assertEqual(summary["failedOrInvalidDocuments"], 1)
        self.assertFalse(summary["healthy"])

    def test_llm_accounting_sums_nested_metadata(self):
        metadata = {
            "page_stats": [
                {"blocks": [{"metadata": {"llm_request_count": 2, "llm_tokens_used": 125}}]},
                {"metadata": {"llm_request_count": 1, "llm_tokens_used": 75}},
            ]
        }
        self.assertEqual(bench.sum_numeric_metadata(metadata, "llm_request_count"), 3)
        self.assertEqual(bench.sum_numeric_metadata(metadata, "llm_tokens_used"), 200)
        records = [{"valid": True, "expectedPages": 1, "latencySeconds": 1, "llmRequestCount": 3, "llmTokensUsed": 200}]
        summary = bench.summarize_repeat(records, 2, 1.0, None)
        self.assertEqual(summary["llmRequestCount"], 3)
        self.assertEqual(summary["llmTokensUsed"], 200)

    def test_diagnostic_is_marker_plus_plus_only_and_not_ranked(self):
        args = bench.build_parser().parse_args(
            [
                "diagnostic", "corpus", "attestation.json", "results",
                "--candidate", "marker-plus-plus-conservative",
                "--source-revision", "e47790de55b8279c9e10a47c29d30fa9911b5299",
                "--build-manifest", "diagnostic.manifest.json",
                "--harness-manifest", "harness.manifest.json", "--approved-harness-sha256", "a" * 64,
                "--run-label", "run-001", "--instance-type", "g4dn.xlarge",
                "--region", "eu-west-1", "--hourly-rate-usd", "1",
                "--deadline-utc", "2099-01-01T00:00:00Z", "--dry-run",
            ]
        )
        self.assertEqual(args.run_mode, "diagnostic")

    def test_build_manifest_must_match_revision(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "build.json"
            path.write_text(json.dumps({"schemaVersion": 1, "commit": "a" * 40, "tree": "b" * 40, "poetryLockSha256": "c" * 64, "archiveSha256": "d" * 64}))
            self.assertEqual(bench.validate_build_manifest(path, "a" * 40)["tree"], "b" * 40)
            with self.assertRaises(ValueError):
                bench.validate_build_manifest(path, "e" * 40)

    def test_stage_and_cpu_gpu_overlap_summaries(self):
        records = [{"stageEvents": [{"stage": "layout", "elapsed_seconds": 2, "status": "ok"}, {"stage": "layout", "elapsed_seconds": 1, "status": "ok"}]}]
        self.assertEqual(bench.summarize_stage_events(records)[0]["hostWallSeconds"], 3)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "telemetry.jsonl"
            path.write_text(
                "\n".join(
                    json.dumps(row)
                    for row in [
                        {"marker_cpu_percent": 50, "gpu_util_percent": 75, "vram_used_mib": 1000},
                        {"marker_cpu_percent": 60, "gpu_util_percent": 0, "vram_used_mib": 1200},
                    ]
                )
            )
            summary = bench.summarize_telemetry(path)
            self.assertEqual(summary["cpuGpuBusySamples"], 1)
            self.assertEqual(summary["gpuIdleCpuBusySamples"], 1)
            self.assertEqual(summary["peakVramMiB"], 1200)

    def test_lightweight_stage_profile_records_events_without_diagnostic_outputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            previous_profile = bench.PROFILE
            previous_artifacts = bench.ARTIFACTS
            try:
                bench.PROFILE = {"__test_adapter": True, "use_llm": False}
                bench.ARTIFACTS = {}
                output = Path(temporary) / "output"
                record = bench._worker_process({
                    "ordinal": 1,
                    "inputPath": "synthetic.pdf",
                    "outputDir": str(output),
                    "pageRange": [0],
                    "expectedPages": 1,
                    "diagnostic": False,
                    "stageProfile": True,
                })
                self.assertTrue(record["valid"])
                self.assertFalse(record["diagnostic"])
                self.assertEqual(record["stageEvents"][0]["stage"], "synthetic.stage")
                self.assertFalse((output / "diagnostic").exists())
            finally:
                bench.PROFILE = previous_profile
                bench.ARTIFACTS = previous_artifacts

    def test_fake_adapter_runs_preview_and_full_diagnostic_cells(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            corpus = root / "corpus"
            corpus.mkdir()
            shutil.copyfile(ROOT / "scripts/e2e/fixtures/sample-paper.pdf", corpus / "pdf-001.pdf")
            attestation_path = root / "attestation.json"
            documents = [{"ordinal": 1, "file": "pdf-001.pdf", "bytes": (corpus / "pdf-001.pdf").stat().st_size, "sha256": bench.file_sha256(corpus / "pdf-001.pdf"), "pages": bench.page_count(corpus / "pdf-001.pdf"), "classes": ["redistributable-test"]}]
            bench.write_json(attestation_path, {"schemaVersion": 1, "documents": documents, "fingerprint": bench.canonical_sha256(documents)})
            revision = "e47790de55b8279c9e10a47c29d30fa9911b5299"
            build = root / "build.json"
            bench.write_json(build, {"schemaVersion": 1, "commit": revision, "tree": "b" * 40, "poetryLockSha256": "c" * 64, "archiveSha256": "d" * 64})
            harness = bench.package_harness(root / "harness.tar.gz")
            harness_manifest = root / "harness.tar.gz.manifest.json"
            environment = os.environ.copy()
            environment["MARKER_TELEMETRY_MODE"] = "cpu"
            result = subprocess.run(
                [
                    "python3", str(ROOT / "scripts/marker-bench.py"), "diagnostic",
                    str(corpus), str(attestation_path), str(root / "results"),
                    "--candidate", "marker-plus-plus-conservative", "--source-revision", revision,
                    "--build-manifest", str(build), "--run-label", "synthetic",
                    "--harness-manifest", str(harness_manifest), "--approved-harness-sha256", harness["harnessSha256"],
                    "--instance-type", "g4dn.xlarge", "--region", "eu-west-1",
                    "--hourly-rate-usd", "1", "--deadline-utc", "2099-01-01T00:00:00Z",
                    "--worker-startup-timeout-seconds", "10", "--test-adapter",
                ],
                cwd=ROOT, env=environment, text=True, capture_output=True, timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            run = root / "results/synthetic/diagnostic/marker-plus-plus-conservative"
            self.assertTrue((run / "preview/workers-1/repeat-1/summary.json").is_file())
            self.assertTrue((run / "full-document/workers-1/repeat-1/summary.json").is_file())
            self.assertFalse(bench.load_json(run / "run-manifest.json")["rankingEligible"])

    def test_zero_llm_calls_fail_preview_and_block_full_cell(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            corpus = root / "corpus"
            corpus.mkdir()
            source = ROOT / "scripts/e2e/fixtures/sample-paper.pdf"
            shutil.copyfile(source, corpus / "pdf-001.pdf")
            documents = [{
                "ordinal": 1, "file": "pdf-001.pdf", "bytes": source.stat().st_size,
                "sha256": bench.file_sha256(source), "pages": bench.page_count(source),
                "classes": ["redistributable-test"],
            }]
            attestation = root / "attestation.json"
            bench.write_json(attestation, {"schemaVersion": 1, "documents": documents, "fingerprint": bench.canonical_sha256(documents)})
            revision = "2d66e45c0a1f8a3c081c6c96f47e1f7b6af2b03a"
            build = root / "build.json"
            bench.write_json(build, {
                "schemaVersion": 1, "commit": revision, "tree": "b" * 40,
                "poetryLockSha256": "c" * 64, "archiveSha256": "d" * 64,
                "repositoryIntegrationSha256": bench.file_sha256(ROOT / "oghma_marker/services.py"),
            })
            harness = bench.package_harness(root / "harness.tar.gz")
            environment = os.environ.copy()
            environment.update(MARKER_TELEMETRY_MODE="cpu", MARKER_TEST_LLM_MODE="zero")
            result = subprocess.run(
                [
                    "python3", str(ROOT / "scripts/marker-bench.py"), "run",
                    str(corpus), str(attestation), str(root / "results"),
                    "--candidate", "marker-plus-plus-academic-enhanced-local",
                    "--allow-disabled-candidate", "--allow-llm-benchmark",
                    "--source-revision", revision, "--build-manifest", str(build),
                    "--harness-manifest", str(root / "harness.tar.gz.manifest.json"),
                    "--approved-harness-sha256", harness["harnessSha256"],
                    "--run-label", "zero-llm", "--instance-type", "g5.xlarge",
                    "--region", "eu-west-1", "--hourly-rate-usd", "1",
                    "--deadline-utc", "2099-01-01T00:00:00Z",
                    "--worker-startup-timeout-seconds", "10", "--test-adapter",
                ],
                cwd=ROOT, env=environment, text=True, capture_output=True, timeout=30,
            )
            self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
            run = root / "results/zero-llm/decision/marker-plus-plus-academic-enhanced-local"
            records = (run / "preview/workers-1/repeat-1/requests.jsonl").read_text()
            self.assertIn("llm_required_but_unused", records)
            skipped = bench.load_json(run / "full-document/workers-1/skipped.json")
            self.assertEqual(skipped["reason"], "preview_not_healthy")


class ArtifactTests(unittest.TestCase):
    def make_results(self, root):
        (root / "preview/workers-1/repeat-1/output/document-001").mkdir(parents=True)
        (root / "private").mkdir()
        metrics = {
            "run-manifest.json": {"candidate": "marker-release-1.10.2"},
            "complete.json": {"healthy": True},
            "preview/workers-1/repeat-1/repeat.json": {"order": [1]},
            "preview/workers-1/repeat-1/requests.jsonl": "{\"ordinal\":1,\"valid\":true}\n",
            "preview/workers-1/repeat-1/summary.json": {"successfulPages": 1},
            "preview/workers-1/repeat-1/telemetry.jsonl": "{\"gpu_util_percent\":90}\n",
        }
        for relative, value in metrics.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value if isinstance(value, str) else json.dumps(value))
        output = root / "preview/workers-1/repeat-1/output/document-001"
        (output / "pdf-001.md").write_text("# output\n\n![figure](figure.jpg)\n")
        (output / "pdf-001_meta.json").write_text(json.dumps({"page_stats": [{"page_id": 0}]}))
        (output / "figure.jpg").write_bytes(b"image")
        debug = output / "diagnostic/pdf-001"
        debug.mkdir(parents=True)
        (debug / "pdf_page_0.png").write_bytes(b"source-overlay")
        (debug / "layout_page_0.png").write_bytes(b"layout-overlay")
        (debug / "blocks.json").write_text("[]")
        (root / "private/corpus-attestation.json").write_text(json.dumps({"documents": [{"ordinal": 1}]}))

    def test_two_bundles_round_trip(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            results = root / "results"
            results.mkdir()
            self.make_results(results)
            bundles = artifacts.finalize(results, root / "bundle", "run-001")
            self.assertEqual({item["bundleClass"] for item in bundles}, {"metrics", "quality", "restricted"})
            for item in bundles:
                bundle = Path(item["path"])
                receipt = artifacts.verify(bundle, f"{bundle}.sha256")
                self.assertEqual(receipt["bundleClass"], item["bundleClass"])
                self.assertEqual(receipt["runLabel"], "run-001")

    def test_unclassified_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "unknown.bin").write_bytes(b"data")
            with self.assertRaises(ValueError):
                artifacts.finalize(root, root / "bundle", "run-001")

    def test_metrics_private_content_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "run-manifest.json").write_text(json.dumps({"path": "/workspace/private"}))
            with self.assertRaises(ValueError):
                artifacts.finalize(root, root / "bundle", "run-001")


class ComparatorTests(unittest.TestCase):
    def test_structural_delta_requires_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            reference = root / "reference/document-001"
            candidate = root / "candidate/document-001"
            reference.mkdir(parents=True)
            candidate.mkdir(parents=True)
            (reference / "pdf-001.md").write_text("# Heading\n\ntext\n")
            (candidate / "pdf-001.md").write_text("text\n")
            metadata = json.dumps({"page_stats": [{"page_id": 0}]})
            (reference / "pdf-001_meta.json").write_text(metadata)
            (candidate / "pdf-001_meta.json").write_text(metadata)
            result = comparator.compare(root / "reference", root / "candidate")
            self.assertEqual(result["manualReviewFiles"], 1)
            self.assertIn("structure_delta", result["results"][0]["flags"])


if __name__ == "__main__":
    unittest.main()
