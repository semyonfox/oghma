import json
import base64
import io
import sys
import threading
import types
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image
from pydantic import BaseModel

# Keep these standard-library tests independent of Marker/Surya model installs.
try:
    import marker.services  # noqa: F401
except (ImportError, ModuleNotFoundError):
    marker = types.ModuleType("marker")
    services = types.ModuleType("marker.services")
    blocks = types.ModuleType("marker.schema.blocks")
    schema = types.ModuleType("marker.schema")

    class BaseService:
        timeout = 30
        max_retries = 2
        retry_wait_time = 0.25
        max_output_tokens = None

        def __init__(self, config=None):
            for key, value in (config or {}).items():
                if hasattr(self, key):
                    setattr(self, key, value)

        def img_to_base64(self, image, format="WEBP"):
            stream = io.BytesIO()
            image.save(stream, format=format)
            return base64.b64encode(stream.getvalue()).decode()

        def format_image_for_llm(self, image):
            if image is None:
                return []
            return self.process_images(image if isinstance(image, list) else [image])

    class Block:
        pass

    services.BaseService = BaseService
    blocks.Block = Block
    marker.services = services
    marker.schema = schema
    schema.blocks = blocks
    sys.modules.update({
        "marker": marker, "marker.services": services,
        "marker.schema": schema, "marker.schema.blocks": blocks,
    })

from oghma_marker.services import OpenAICompatibleVisionService, RequiredLLMFailure


MODEL = "Qwen/Qwen3.5-4B"


class Answer(BaseModel):
    answer: str


class Equation(BaseModel):
    corrected_html: str


class Table(BaseModel):
    corrected_html: str
    score: int


class FakeHandler(BaseHTTPRequestHandler):
    scenarios = []
    requests = []

    def log_message(self, *_args):
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        type(self).requests.append(payload)
        scenario = type(self).scenarios.pop(0)
        if scenario == "timeout":
            time.sleep(0.1)
            return
        if scenario == "disconnect":
            self.connection.close()
            return
        status = scenario if isinstance(scenario, int) else 200
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if status != 200:
            self.wfile.write(b"{}")
            return
        response = scenario
        if isinstance(scenario, dict) and "choices" not in scenario:
            response = {
                "model": MODEL,
                "choices": [{"message": {"content": json.dumps(scenario)}}],
                "usage": {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10},
            }
        self.wfile.write(json.dumps(response).encode())


class VisionServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        FakeHandler.scenarios = []
        FakeHandler.requests = []

    def service(self, **overrides):
        config = {
            "llm_base_url": f"http://127.0.0.1:{self.server.server_port}/v1",
            "llm_model": MODEL,
            "llm_approved_model": MODEL,
            "max_retries": 1,
            "retry_wait_time": 0,
        }
        config.update(overrides)
        return OpenAICompatibleVisionService(config)

    def call(self, schema=Answer, images=None):
        return self.service()("private prompt", images, None, schema)

    def assert_category(self, category, function):
        with self.assertRaises(RequiredLLMFailure) as caught:
            function()
        self.assertEqual(caught.exception.category, category)
        self.assertEqual(str(caught.exception), category)

    def test_text_only_structured_response(self):
        FakeHandler.scenarios = [{"answer": "ok"}]
        self.assertEqual(self.call(), {"answer": "ok"})
        request = FakeHandler.requests[0]
        self.assertEqual(request["response_format"]["type"], "json_schema")
        self.assertTrue(request["response_format"]["json_schema"]["strict"])
        self.assertEqual(request["chat_template_kwargs"], {"enable_thinking": False})

    def test_one_and_multiple_images(self):
        for count in (1, 2):
            FakeHandler.scenarios = [{"answer": "described"}]
            images = [Image.new("RGB", (2, 2), "white") for _ in range(count)]
            self.assertEqual(self.call(images=images)["answer"], "described")
            content = FakeHandler.requests[-1]["messages"][0]["content"]
            self.assertEqual(sum(item["type"] == "image_url" for item in content), count)

    def test_equation_table_and_complex_schemas(self):
        cases = [
            (Equation, {"corrected_html": "<math>x</math>"}),
            (Table, {"corrected_html": "<table></table>", "score": 5}),
            (Answer, {"answer": "diagram nodes and edges"}),
        ]
        for schema, response in cases:
            FakeHandler.scenarios = [response]
            self.assertEqual(self.call(schema=schema), response)

    def test_invalid_json_and_wrong_schema_fail(self):
        FakeHandler.scenarios = [
            {"model": MODEL, "choices": [{"message": {"content": "{"}}]},
        ]
        self.assert_category("llm_schema_error", self.call)
        FakeHandler.scenarios = [{"wrong": "field"}]
        self.assert_category("llm_schema_error", self.call)

    def test_non_retryable_400_and_retryable_500(self):
        FakeHandler.scenarios = [400]
        self.assert_category("llm_http_error", self.call)
        self.assertEqual(len(FakeHandler.requests), 1)
        FakeHandler.scenarios = [500, {"answer": "retry worked"}]
        self.assertEqual(self.call()["answer"], "retry worked")
        self.assertEqual(len(FakeHandler.requests), 3)

    def test_429_retry_limit_is_enforced(self):
        FakeHandler.scenarios = [429, 429]
        self.assert_category("llm_http_error", self.call)
        self.assertEqual(len(FakeHandler.requests), 2)

    def test_disconnect_is_bounded_and_safe(self):
        FakeHandler.scenarios = ["disconnect", "disconnect"]
        self.assert_category("llm_timeout", self.call)
        self.assertEqual(len(FakeHandler.requests), 2)

    def test_timeout_is_bounded_and_safe(self):
        FakeHandler.scenarios = ["timeout", "timeout"]
        self.assert_category("llm_timeout", lambda: self.service(timeout=0.01)("private", None, None, Answer))
        self.assertEqual(len(FakeHandler.requests), 2)

    def test_wrong_returned_or_configured_model_fails(self):
        FakeHandler.scenarios = [{"model": "wrong", "choices": [{"message": {"content": '{"answer":"x"}'}}]}]
        self.assert_category("llm_model_mismatch", self.call)
        self.assert_category(
            "llm_model_mismatch",
            lambda: self.service(llm_model="wrong"),
        )

    def test_accounting_has_tokens_latency_and_no_content(self):
        FakeHandler.scenarios = [{"answer": "private result"}]
        service = self.service()
        service("private prompt", None, None, Answer)
        snapshot = service.accounting_snapshot()
        self.assertEqual(snapshot["successfulRequests"], 1)
        self.assertEqual(snapshot["inputTokens"], 7)
        self.assertEqual(snapshot["outputTokens"], 3)
        self.assertEqual(snapshot["records"][0]["processorType"], "Answer")
        serialized = json.dumps(snapshot)
        self.assertNotIn("private prompt", serialized)
        self.assertNotIn("private result", serialized)

    def test_non_loopback_endpoint_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "loopback"):
            self.service(llm_base_url="http://192.0.2.1:8000/v1")


if __name__ == "__main__":
    unittest.main()
