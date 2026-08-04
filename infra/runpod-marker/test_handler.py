"""Focused, credential-free tests for the RunPod Marker++ handler helpers."""

from __future__ import annotations

import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError


HANDLER_PATH = Path(__file__).with_name("handler.py")
REQUEST_ID = "11111111-1111-4111-8111-111111111111"


def load_handler_module() -> types.ModuleType:
    fake_runpod = types.ModuleType("runpod")
    fake_runpod.serverless = types.SimpleNamespace(start=lambda _config: None)

    fake_marker = types.ModuleType("marker")
    fake_marker_models = types.ModuleType("marker.models")
    fake_marker_models.create_model_dict = lambda: {}
    fake_marker_models.shutdown_models = lambda _models: None

    fake_server = types.ModuleType("server")
    fake_server.bool_option = (
        lambda value, fallback: value if isinstance(value, bool) else fallback
    )
    fake_server.convert_file = lambda *_args: {}
    fake_server.positive_int_env = lambda _name, fallback: fallback

    modules = {
        "runpod": fake_runpod,
        "marker": fake_marker,
        "marker.models": fake_marker_models,
        "server": fake_server,
    }
    module_name = "runpod_marker_handler_test_module"
    spec = importlib.util.spec_from_file_location(module_name, HANDLER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load handler.py for test")
    module = importlib.util.module_from_spec(spec)
    with (
        patch.dict(sys.modules, modules),
        patch.dict(os.environ, {"MARKER_ALLOWED_OBJECT_HOSTS": "objects.example"}),
    ):
        spec.loader.exec_module(module)
    return module


class HandlerOptionsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.handler = load_handler_module()
        self.handler._MODELS = object()

    def test_convert_job_defaults_use_llm_to_false(self) -> None:
        captured: list[tuple[object, ...]] = []

        def fake_convert_file(*args: object) -> dict[str, object]:
            captured.append(args)
            return {"success": True}

        self.handler.convert_file = fake_convert_file
        self.handler.convert_job("/tmp/document.pdf", {})

        self.assertEqual(captured[0][-1], False)

    def test_convert_job_forwards_explicit_use_llm_true(self) -> None:
        captured: list[tuple[object, ...]] = []

        def fake_convert_file(*args: object) -> dict[str, object]:
            captured.append(args)
            return {"success": True}

        self.handler.convert_file = fake_convert_file
        self.handler.convert_job("/tmp/document.pdf", {"useLlm": True})

        self.assertEqual(captured[0][-1], True)


class HandlerContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.handler = load_handler_module()

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
        self.handler.OBJECT_OPENER = opener

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


if __name__ == "__main__":
    unittest.main()
