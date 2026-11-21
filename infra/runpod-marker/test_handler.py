"""Focused, credential-free tests for the RunPod Marker++ handler helpers."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from urllib.error import HTTPError

import httpx

from oghma_marker import job


HANDLER_PATH = Path(__file__).with_name("handler.py")
ROOT = HANDLER_PATH.resolve().parents[2]
REQUEST_ID = "11111111-1111-4111-8111-111111111111"
PAYLOAD = {
    "requestId": REQUEST_ID,
    "resultKey": f"marker-results/{REQUEST_ID}.json",
    "sourceUrl": "https://objects.example/source",
    "resultUrl": "https://objects.example/result",
}
CPU_RECOMMENDATION = types.SimpleNamespace(
    stdout=json.dumps({"suggested_route": "cpu", "math_glyph_pages": 0})
)
CPU_ROUTE_ENV = {
    "MARKER_ALLOWED_OBJECT_HOSTS": "objects.example",
    "MARKER_CPU_ROUTE": "on",
    "MARKER_CPU_WORKER_URL": "http://cpu-worker",
    "MARKER_CPU_WORKER_TOKEN": "test-token",
}


def load_handler_module() -> types.ModuleType:
    fake_runpod = types.ModuleType("runpod")
    fake_runpod.serverless = types.SimpleNamespace(start=lambda _config: None)

    fake_marker = types.ModuleType("marker")
    fake_marker_models = types.ModuleType("marker.models")
    fake_marker_models.create_model_dict = lambda: {}
    fake_marker_models.shutdown_models = lambda _models: None

    fake_conversion = types.ModuleType("oghma_marker.conversion")
    fake_conversion.conversion_mode = lambda _options: "vllm"
    fake_conversion.convert_file = lambda *_args: {}

    modules = {
        "runpod": fake_runpod,
        "marker": fake_marker,
        "marker.models": fake_marker_models,
        "oghma_marker.conversion": fake_conversion,
    }
    return load_module(HANDLER_PATH, modules)


def load_module(
    path: Path, modules: dict[str, types.ModuleType], *, package: str = ""
) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(f"{package}test_{path.stem}_module", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {path.name} for test")
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module


class HandlerOptionsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.handler = load_handler_module()
        self.handler._MODELS = object()

    def test_convert_job_forwards_worker_options(self) -> None:
        options = {"mode": "vllm", "useLlm": True}
        with patch.object(self.handler, "convert_file", return_value={"success": True}) as convert:
            self.assertEqual(self.handler.convert_job("/tmp/document.pdf", options), {"success": True})
        convert.assert_called_once_with(self.handler._MODELS, "/tmp/document.pdf", options)


class CpuRouteTest(unittest.TestCase):
    def check_route(self, flag: str, math_glyph_pages: int, *, use_cpu: bool) -> None:
        completed = {
            "success": True,
            "requestId": PAYLOAD["requestId"],
            "resultKey": PAYLOAD["resultKey"],
        }
        response = job.httpx.Response(
            200, json=completed, request=job.httpx.Request("POST", "http://cpu-worker/marker/job")
        )
        classification = types.SimpleNamespace(
            stdout=json.dumps({"suggested_route": "cpu", "math_glyph_pages": math_glyph_pages})
        )
        with (
            patch.dict(os.environ, {**CPU_ROUTE_ENV, "MARKER_CPU_ROUTE": flag}),
            patch.object(job.subprocess, "run", return_value=classification) as classify,
            patch.object(job.httpx, "post", return_value=response) as post,
        ):
            result, may_exist = job.route_to_cpu("/tmp/document.pdf", PAYLOAD, {"mode": "vllm"})

        self.assertFalse(may_exist)
        if use_cpu:
            self.assertEqual(result, completed)
            self.assertEqual(post.call_args.args, ("http://cpu-worker/marker/job",))
            self.assertEqual(
                post.call_args.kwargs["json"],
                {**PAYLOAD, "filename": "document.pdf", "options": {"mode": "fast"}},
            )
            self.assertEqual(post.call_args.kwargs["headers"], {"Authorization": "Bearer test-token"})
        else:
            self.assertIsNone(result)
            post.assert_not_called()
        if flag == "off":
            classify.assert_not_called()

    def test_cpu_recommendation_without_maths_uses_cpu(self) -> None:
        self.check_route("on", 0, use_cpu=True)

    def test_cpu_recommendation_with_maths_stays_on_gpu(self) -> None:
        self.check_route("on", 1, use_cpu=False)

    def test_flag_off_keeps_cpu_recommendation_on_gpu(self) -> None:
        self.check_route("off", 0, use_cpu=False)


@patch.dict(os.environ, CPU_ROUTE_ENV)
class CpuFallbackTest(unittest.TestCase):
    def setUp(self) -> None:
        self.handler = load_handler_module()
        self.handler.TELEMETRY_INTERVAL_SECONDS = 0

    def run_job(self, *, result_already_exists: bool = False) -> None:
        options = {"mode": "vllm", "pageRange": "2-3"}
        convert = AsyncMock(return_value={"output": "# Converted on GPU"})
        with (
            patch.object(self.handler, "download", return_value=100),
            patch.object(self.handler, "run_conversion", convert),
            patch.object(self.handler, "upload", return_value=not result_already_exists) as upload,
        ):
            response = asyncio.run(self.handler.handler({"input": {**PAYLOAD, "options": options}}))

        self.assertTrue(response["success"])
        self.assertEqual(response["resultKey"], PAYLOAD["resultKey"])
        self.assertEqual(response["resultAlreadyExisted"], result_already_exists)
        self.assertEqual(convert.await_args.args[1], options)
        self.assertEqual(upload.call_args.args[0], PAYLOAD["resultUrl"])
        self.assertEqual(json.loads(upload.call_args.args[1])["output"], "# Converted on GPU")

    def test_classifier_failure_falls_back_to_gpu_without_posting(self) -> None:
        for error in (
            subprocess.CalledProcessError(1, "marker_classify"),
            subprocess.TimeoutExpired("marker_classify", 120),
        ):
            with (
                self.subTest(error=type(error).__name__),
                patch.object(job.subprocess, "run", side_effect=error),
                patch.object(job.httpx, "post") as post,
            ):
                self.run_job()
                post.assert_not_called()

    @patch.object(job.subprocess, "run", return_value=CPU_RECOMMENDATION)
    def test_cpu_worker_http_failure_falls_back_to_gpu(self, _classify: Mock) -> None:
        response = job.httpx.Response(
            503, request=job.httpx.Request("POST", "http://cpu-worker/marker/job")
        )
        with patch.object(job.httpx, "post", return_value=response):
            self.run_job()

    @patch.object(job.subprocess, "run", return_value=CPU_RECOMMENDATION)
    def test_lost_cpu_response_can_leave_the_existing_result_in_place(self, _classify: Mock) -> None:
        with patch.object(job.httpx, "post", side_effect=job.httpx.ReadTimeout("timeout")):
            self.run_job(result_already_exists=True)


    @patch.object(job.subprocess, "run", return_value=CPU_RECOMMENDATION)
    def test_gpu_failure_after_lost_cpu_response_leaves_result_pending(self, _classify: Mock) -> None:
        with (
            patch.object(job.httpx, "post", side_effect=job.httpx.ReadTimeout("timeout")),
            patch.object(self.handler, "download", return_value=100),
            patch.object(self.handler, "run_conversion", new=AsyncMock(side_effect=RuntimeError("GPU error"))),
        ):
            response = asyncio.run(self.handler.handler({"input": PAYLOAD}))

        self.assertFalse(response["success"])
        self.assertTrue(response["resultPending"])
        self.assertEqual(response["resultKey"], PAYLOAD["resultKey"])


class ConversionMetadataTest(unittest.TestCase):
    def setUp(self) -> None:
        self.pdf_provider = object()
        self.classify_pdf = Mock(side_effect=RuntimeError("classification unavailable"))
        exports = {
            "marker.classification": {"classify_pdf": self.classify_pdf, "GPU_SCAN_FRACTION": 0.25},
            "marker.config.parser": {"ConfigParser": object},
            "marker.converters.pdf": {"PdfConverter": object},
            "marker.output": {"text_from_rendered": lambda _rendered: ("# Rendered", None, {})},
            "marker.providers.pdf": {"PdfProvider": self.pdf_provider},
            "marker.providers.registry": {"provider_from_filepath": lambda _path: self.pdf_provider},
            "marker.settings": {"settings": types.SimpleNamespace(OUTPUT_IMAGE_FORMAT="PNG")},
        }
        modules = {}
        for name, values in exports.items():
            modules[name] = types.ModuleType(name)
            vars(modules[name]).update(values)
        self.conversion = load_module(
            ROOT / "oghma_marker/conversion.py", modules, package="oghma_marker."
        )

    def convert(self, metadata: dict, **options: str) -> dict:
        def build(_models: object, resolved: dict) -> Mock:
            return Mock(
                return_value=types.SimpleNamespace(metadata=metadata),
                mode=resolved["mode"],
                profile_summary=None,
            )

        with patch.object(self.conversion, "build_converter", side_effect=build):
            return self.conversion.convert_file({}, "document.pdf", options)

    @patch.dict(os.environ, {"MARKER_CPU_ROUTE": "off"})
    def test_missing_classification_keeps_rendered_output(self) -> None:
        result = self.convert({"page_stats": [{"page_id": 3, "kind": None}]})
        self.assertEqual(result["output"], "# Rendered")
        self.assertNotIn("page_kinds", result["metadata"])
        self.assertNotIn("suggested_route", result["metadata"])
        self.classify_pdf.assert_not_called()

    def test_reuses_page_kinds_and_reports_effective_mode(self) -> None:
        result = self.convert(
            {"page_stats": [{"page_id": 3, "kind": "scan"}], "mode": "balanced"},
            pageRange="3",
        )
        self.assertEqual(result["metadata"]["mode"], "vllm")
        self.assertEqual(result["metadata"]["page_kinds"], [{"page_id": 3, "kind": "scan"}])
        self.assertEqual(result["metadata"]["suggested_route"], "gpu")
        self.classify_pdf.assert_not_called()

    def test_malformed_classification_metadata_keeps_rendered_output(self) -> None:
        with self.assertLogs(self.conversion.logger, level="WARNING"):
            result = self.convert({"page_stats": [{"kind": "scan"}]}, mode="fast")
        self.assertEqual(result["output"], "# Rendered")
        self.assertEqual(result["metadata"]["mode"], "fast")
        self.assertNotIn("page_kinds", result["metadata"])
        self.assertNotIn("suggested_route", result["metadata"])


def load_backend() -> types.ModuleType:
    marker_models = types.ModuleType("marker.models")
    marker_models.create_model_dict = Mock()
    conversion = types.ModuleType("oghma_marker.conversion")
    conversion.conversion_mode = Mock()
    conversion.convert_file = Mock()
    return load_module(
        ROOT / "infra/vast-marker/backend.py",
        {"marker.models": marker_models, "oghma_marker.conversion": conversion},
    )


class VastBackendTest(unittest.IsolatedAsyncioTestCase):
    @patch.dict(os.environ, {"MARKER_CPU_ONLY": "1", "MARKER_CPU_WORKER_TOKEN": "test-token"})
    async def test_cpu_job_endpoint_requires_token_before_handling_payload(self) -> None:
        backend = load_backend()
        transport = httpx.ASGITransport(app=backend.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://cpu-worker") as client:
            self.assertEqual((await client.post("/marker/job", json={})).status_code, 401)
            response = await client.post(
                "/marker/job", json={}, headers={"Authorization": "Bearer wrong"}
            )
            self.assertEqual(response.status_code, 401)
            # a valid token reaches ordinary request validation
            headers = {"Authorization": "Bearer test-token"}
            response = await client.post("/marker/job", json={}, headers=headers)
            self.assertEqual(response.status_code, 400)
            with patch.dict(os.environ, {"MARKER_CPU_WORKER_TOKEN": ""}):
                response = await client.post("/marker/job", json={}, headers=headers)
                self.assertEqual(response.status_code, 401)
        backend.conversion_mode.assert_not_called()


    @patch.dict(os.environ, {**CPU_ROUTE_ENV, "MARKER_CPU_ONLY": "0"})
    async def test_vast_reports_ambiguous_failure_when_cpu_result_may_exist(self) -> None:
        backend = load_backend()
        backend.TELEMETRY_INTERVAL_SECONDS = 0
        transport = httpx.ASGITransport(app=backend.app)
        with (
            patch.object(job.subprocess, "run", return_value=CPU_RECOMMENDATION),
            patch.object(job.httpx, "post", side_effect=job.httpx.ReadTimeout("timeout")),
            patch.object(backend, "download", return_value=100),
            patch.object(backend, "run_conversion", new=AsyncMock(side_effect=RuntimeError("GPU error"))),
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://vast-worker") as client:
                response = await client.post("/marker/job", json=PAYLOAD)

        self.assertEqual(response.status_code, 502)
        self.assertNotIn("success", response.json())


class RunPodSupervisorTest(unittest.TestCase):
    def check_vllm_exit(self, *, during_readiness: bool) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            stubs = Path(tmp) / "stubs.sh"
            stubs.write_text(
                """
# the old launcher execs the handler, which needs to invoke our stub
function exec { "$@"; exit $?; }
function /opt/vllm-venv/bin/python { cat >/dev/null; }
function curl {
  if [[ "$TEST_EXIT_DURING_READINESS" == 1 ]]; then sleep .15; fi
  return 0
}
function /opt/vllm-venv/bin/vllm {
  if [[ "$TEST_EXIT_DURING_READINESS" == 1 ]]; then return 37; fi
  for ((i = 0; i < 40; i++)); do
    if [[ -e "$TEST_DIR/handler-started" ]]; then
      sleep .1
      return 37
    fi
    sleep .05
  done
  return 99
}
function /opt/marker-venv/bin/python {
  if [[ "$1" == -c ]]; then
    echo checkpoint
    return
  fi
  touch "$TEST_DIR/handler-started"
  trap 'echo handler-stopped; exit 0' TERM
  for ((i = 0; i < 40; i++)); do sleep .05; done
  return 98
}
"""
            )
            env = {
                **os.environ,
                "BASH_ENV": str(stubs),
                "TEST_DIR": tmp,
                "TEST_EXIT_DURING_READINESS": str(int(during_readiness)),
                "HF_HOME": tmp,
                "TORCH_HOME": tmp,
                "XDG_CACHE_HOME": tmp,
                "MARKER_RUNTIME": "serverless",
            }
            env.pop("RUNPOD_INIT_TIMEOUT", None)
            run = subprocess.run(
                ["bash", str(HANDLER_PATH.with_name("run.sh"))],
                env=env, capture_output=True, text=True, timeout=8,
            )

        self.assertEqual(run.returncode, 37, run.stdout + run.stderr)
        self.assertIn("vLLM exited unexpectedly status=37", run.stderr)
        if not during_readiness:
            self.assertIn("handler-stopped", run.stdout)

    def test_vllm_exit_during_readiness_handoff_exits(self) -> None:
        self.check_vllm_exit(during_readiness=True)

    def test_vllm_exit_after_readiness_stops_handler_and_exits(self) -> None:
        self.check_vllm_exit(during_readiness=False)


class HandlerContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.handler = load_handler_module()

    def test_default_result_cap_stays_below_the_public_proxy_limit(self) -> None:
        self.assertEqual(self.handler.MAX_RESULT_BYTES, 90 * 1024 * 1024)

    def test_binds_result_key_to_canonical_callback_uuid(self) -> None:
        result_key = f"marker-results/{REQUEST_ID}.json"
        self.assertEqual(
            self.handler.validate_request_identity(
                {"requestId": REQUEST_ID, "resultKey": result_key}
            ),
            (REQUEST_ID, result_key),
        )
        with self.assertRaisesRegex(ValueError, "resultKey"):
            self.handler.validate_request_identity(
                {"requestId": REQUEST_ID, "resultKey": "marker-results/other.json"}
            )

    @patch.dict(os.environ, {"MARKER_ALLOWED_OBJECT_HOSTS": "objects.example"})
    def test_accepts_only_allowlisted_https_object_hosts(self) -> None:
        self.assertEqual(
            self.handler.validate_object_url(
                "https://objects.example/signed-object", "sourceUrl"
            ),
            "https://objects.example/signed-object",
        )
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            self.handler.validate_object_url(
                "http://objects.example/signed-object", "sourceUrl"
            )
        with self.assertRaisesRegex(ValueError, "approved"):
            self.handler.validate_object_url(
                "https://other.example/signed-object", "sourceUrl"
            )

    def test_result_envelope_has_no_provider_payload_fields(self) -> None:
        envelope = self.handler.build_result_envelope(
            {
                "output": "# Extracted",
                "page_range": [1, 2],
                "images": {"image-1.png": "base64"},
                "metadata": {"pages": 2},
            },
            REQUEST_ID,
            f"marker-results/{REQUEST_ID}.json",
        )
        self.assertEqual(envelope["schema_version"], 1)
        self.assertEqual(envelope["request_id"], REQUEST_ID)
        self.assertNotIn("sourceUrl", envelope)
        self.assertNotIn("resultUrl", envelope)

    def test_safe_error_redacts_signed_urls(self) -> None:
        message = self.handler.safe_error(
            RuntimeError("upload failed https://objects.example/signed?secret=value")
        )
        self.assertEqual(message, "upload failed [redacted-url]")


@patch.dict(os.environ, {"MARKER_ALLOWED_OBJECT_HOSTS": "objects.example"})
class MetricsAndUploadTest(unittest.TestCase):
    def setUp(self) -> None:
        self.handler = load_handler_module()

    def test_metrics_omit_content_urls_and_unknown_fields(self) -> None:
        metrics = self.handler.sanitize_metrics(
            {
                "sourceDownloadMs": 12.3456,
                "conversionMs": 7,
                "sourceUrl": "https://objects.example/secret",
                "resultUrl": "https://objects.example/secret",
                "output": "private document text",
                "filename": "private.pdf",
                "unknownMetric": 99,
                "negative": -1,
            }
        )

        self.assertEqual(metrics["schemaVersion"], 1)
        self.assertEqual(metrics["sourceDownloadMs"], 12.346)
        self.assertEqual(metrics["conversionMs"], 7.0)
        self.assertNotIn("sourceUrl", metrics)
        self.assertNotIn("resultUrl", metrics)
        self.assertNotIn("output", metrics)
        self.assertNotIn("filename", metrics)
        self.assertNotIn("unknownMetric", metrics)
        self.assertNotIn("negative", metrics)

    def test_immutable_upload_treats_precondition_failure_as_sibling_success(self) -> None:
        class PreconditionOpener:
            request = None

            def open(self, request: object, timeout: int) -> None:
                self.request = request
                raise HTTPError(
                    "https://objects.example/signed", 412, "precondition", None, None
                )

        opener = PreconditionOpener()
        with patch.object(job, "OBJECT_OPENER", opener):
            self.assertFalse(
                self.handler.upload("https://objects.example/signed", b'{"schema_version":1}')
            )
        self.assertEqual(opener.request.get_header("If-none-match"), "*")

    def test_warm_pool_collects_worker_ids_without_treating_ints_as_iterables(self) -> None:
        class Future:
            def __init__(self, process_id: int) -> None:
                self.process_id = process_id

            def result(self, timeout: float) -> int:
                return self.process_id

        class Pool:
            def __init__(self) -> None:
                self.process_id = 0

            def submit(self, _fn: object) -> Future:
                self.process_id += 1
                return Future(self.process_id)

        self.handler.HANDLER_CONCURRENCY = 3
        self.handler.WARM_TIMEOUT_SECONDS = 10
        self.handler.get_pool = lambda: Pool()
        self.handler.warm_pool()


class BrokenPoolTest(unittest.TestCase):
    def test_a_dead_conversion_child_does_not_poison_later_jobs(self) -> None:
        from concurrent.futures.process import BrokenProcessPool

        handler = load_handler_module()

        class DeadPool:
            shutdown_calls = 0

            def submit(self, *_args: object) -> None:
                raise BrokenProcessPool("child terminated abruptly")

            def shutdown(self, wait: bool, cancel_futures: bool) -> None:
                self.shutdown_calls += 1

        dead = DeadPool()
        handler._POOL = dead

        with self.assertRaises(BrokenProcessPool):
            asyncio.run(handler.run_conversion("/tmp/document.pdf", {}))

        self.assertIsNone(handler._POOL)
        self.assertEqual(dead.shutdown_calls, 1)


if __name__ == "__main__":
    unittest.main()
