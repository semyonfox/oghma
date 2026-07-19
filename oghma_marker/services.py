"""Fail-closed OpenAI-compatible multimodal service for Marker benchmarks.

Only redacted operational data is retained. Prompts, images, filenames, and raw
responses are deliberately never placed in accounting records or exceptions.
"""

from __future__ import annotations

import json
import http.client
import os
import socket
import threading
import time
import urllib.error
import urllib.request
from typing import Annotated, List

import PIL
from PIL import Image
from pydantic import BaseModel, ValidationError

from marker.schema.blocks import Block
from marker.services import BaseService


SAFE_ERROR_CATEGORIES = {
    "llm_http_error",
    "llm_timeout",
    "llm_schema_error",
    "llm_empty_response",
    "llm_model_mismatch",
}


HOSTED_TARGETS = {
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "api_key_env": "OPENROUTER_API_KEY",
        "provider": "openrouter",
    },
    "openrouter-siliconflow": {
        "base_url": "https://openrouter.ai/api/v1",
        "api_key_env": "OPENROUTER_API_KEY",
        "provider": "openrouter",
        "route": "SiliconFlow",
    },
    "siliconflow": {
        "base_url": "https://api.siliconflow.com/v1",
        "api_key_env": "SILICONFLOW_API_KEY",
        "provider": "siliconflow",
    },
}


class RequiredLLMFailure(BaseException):
    """Required inference failed and must invalidate the current document.

    BaseException is intentional: Marker 1.10.x catches Exception inside its LLM
    processors. The benchmark document boundary catches this safe signal.
    """

    def __init__(self, category: str):
        if category not in SAFE_ERROR_CATEGORIES:
            category = "llm_http_error"
        self.category = category
        super().__init__(category)


class OpenAICompatibleVisionService(BaseService):
    llm_base_url: Annotated[str, "Private OpenAI-compatible base URL."] = "http://127.0.0.1:8000/v1"
    llm_model: Annotated[str, "Exact approved served model name."] = "Qwen/Qwen3.5-4B"
    llm_approved_model: Annotated[str, "Exact approved model identity."] = "Qwen/Qwen3.5-4B"
    llm_thinking: Annotated[bool, "Whether model thinking is enabled."] = False
    llm_endpoint_type: Annotated[str, "OpenAI-compatible endpoint type."] = "chat.completions"
    llm_api_key: Annotated[str, "Optional local-server API key."] = "local-only"
    llm_image_format: Annotated[str, "Image wire format."] = "webp"
    llm_accounting_path: Annotated[str | None, "Optional redacted JSONL accounting path."] = None
    llm_target: Annotated[str | None, "Hosted provider and model target selected from the environment."] = None
    retry_wait_time: Annotated[float, "Retry delay in seconds."] = 0.25

    _retryable_statuses = frozenset({429, 500, 502, 503, 504})

    def __init__(self, config=None):
        super().__init__(config)
        self._hosted_target = self._resolve_hosted_target()
        if self.llm_model != self.llm_approved_model:
            raise RequiredLLMFailure("llm_model_mismatch")
        if not self._hosted_target and not self.llm_base_url.startswith(("http://127.0.0.1:", "http://localhost:")):
            raise ValueError("vision endpoint must be private and loopback-only")
        self._lock = threading.Lock()
        self._records = []

    def _resolve_hosted_target(self):
        if not self.llm_target:
            return None
        target = os.environ.get("MARKER_VISION_TARGET") or self.llm_target
        provider_name, separator, model = target.partition(":")
        provider = HOSTED_TARGETS.get(provider_name)
        if not separator or not model or provider is None:
            allowed = ", ".join(sorted(HOSTED_TARGETS))
            raise ValueError(f"MARKER_VISION_TARGET must be <provider>:<model>; providers: {allowed}")
        api_key = os.environ.get(provider["api_key_env"])
        if not api_key:
            raise ValueError(f"{provider['api_key_env']} is required for {provider_name}")
        self.llm_target = target
        self.llm_base_url = provider["base_url"]
        self.llm_api_key = api_key
        self.llm_model = model
        self.llm_approved_model = model
        return {"name": provider_name, "model": model, **provider}

    def process_images(self, images: List[Image.Image]) -> List[dict]:
        return [
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/{self.llm_image_format};base64,"
                    f"{self.img_to_base64(image, format=self.llm_image_format)}"
                },
            }
            for image in images
        ]

    def accounting_snapshot(self):
        with self._lock:
            records = list(self._records)
        return {
            "attempts": len(records),
            "successfulRequests": sum(row["success"] for row in records),
            "failedRequests": sum(not row["success"] for row in records),
            "inputTokens": sum(row.get("inputTokens", 0) for row in records),
            "outputTokens": sum(row.get("outputTokens", 0) for row in records),
            "records": records,
        }

    def _record(self, *, success, latency, processor_type, category=None, usage=None, model=None):
        usage = usage or {}
        row = {
            "success": bool(success),
            "latencySeconds": round(latency, 6),
            "model": model or self.llm_model,
            "endpointType": self.llm_endpoint_type,
            "processorType": processor_type,
            "inputTokens": int(usage.get("prompt_tokens") or 0),
            "outputTokens": int(usage.get("completion_tokens") or 0),
        }
        if self._hosted_target:
            row["provider"] = self._hosted_target["provider"]
            row["providerRoute"] = self._hosted_target.get("route")
        if category:
            row["errorCategory"] = category
        with self._lock:
            self._records.append(row)
            if self.llm_accounting_path:
                with open(self.llm_accounting_path, "a", encoding="utf-8") as stream:
                    stream.write(json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n")

    def _payload(self, prompt, image, response_schema):
        content = [*self.format_image_for_llm(image), {"type": "text", "text": prompt}]
        schema = response_schema.model_json_schema()
        payload = {
            "model": self.llm_model,
            "messages": [{"role": "user", "content": content}],
            "temperature": 0,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": response_schema.__name__, "strict": True, "schema": schema},
            },
        }
        if self.max_output_tokens:
            payload["max_tokens"] = self.max_output_tokens
        if self._hosted_target and self._hosted_target["provider"] == "openrouter":
            payload["reasoning"] = {"enabled": bool(self.llm_thinking)}
            if self._hosted_target.get("route"):
                payload["provider"] = {
                    "order": [self._hosted_target["route"]],
                    "allow_fallbacks": False,
                    "data_collection": "deny",
                }
        elif self._hosted_target and self._hosted_target["provider"] == "siliconflow":
            payload["enable_thinking"] = bool(self.llm_thinking)
        elif not self.llm_thinking:
            payload["chat_template_kwargs"] = {"enable_thinking": False}
        return payload

    def __call__(self, prompt: str, image: PIL.Image.Image | List[PIL.Image.Image] | None,
                 block: Block | None, response_schema: type[BaseModel],
                 max_retries: int | None = None, timeout: int | None = None):
        retries = self.max_retries if max_retries is None else max_retries
        timeout = self.timeout if timeout is None else timeout
        headers = {"Authorization": f"Bearer {self.llm_api_key}", "Content-Type": "application/json"}
        if self._hosted_target and self._hosted_target["provider"] == "openrouter":
            headers.update({"HTTP-Referer": "https://oghmanotes.ie", "X-Title": "OghmaNotes Marker benchmark"})
        request = urllib.request.Request(
            f"{self.llm_base_url.rstrip('/')}/chat/completions",
            data=json.dumps(self._payload(prompt, image, response_schema)).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        processor_type = response_schema.__name__
        for attempt in range(retries + 1):
            started = time.monotonic()
            category = "llm_http_error"
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    body = response.read()
                if not body:
                    category = "llm_empty_response"
                    raise ValueError(category)
                envelope = json.loads(body)
                returned_model = envelope.get("model")
                if returned_model != self.llm_approved_model:
                    category = "llm_model_mismatch"
                    raise ValueError(category)
                choices = envelope.get("choices") or []
                content = choices[0].get("message", {}).get("content") if choices else None
                if not content:
                    category = "llm_empty_response"
                    raise ValueError(category)
                parsed = json.loads(content) if isinstance(content, str) else content
                validated = response_schema.model_validate(parsed)
                usage = envelope.get("usage") or {}
                self._record(
                    success=True,
                    latency=time.monotonic() - started,
                    processor_type=processor_type,
                    usage=usage,
                    model=returned_model,
                )
                if block:
                    block.update_metadata(
                        llm_request_count=1,
                        llm_tokens_used=int(usage.get("total_tokens") or
                                            (usage.get("prompt_tokens") or 0) + (usage.get("completion_tokens") or 0)),
                    )
                return validated.model_dump()
            except urllib.error.HTTPError as exc:
                self._record(success=False, latency=time.monotonic() - started, processor_type=processor_type, category=category)
                if exc.code in self._retryable_statuses and attempt < retries:
                    time.sleep(self.retry_wait_time * (attempt + 1))
                    continue
            except (TimeoutError, socket.timeout, urllib.error.URLError, http.client.RemoteDisconnected):
                category = "llm_timeout"
                self._record(success=False, latency=time.monotonic() - started, processor_type=processor_type, category=category)
                if attempt < retries:
                    time.sleep(self.retry_wait_time * (attempt + 1))
                    continue
            except (json.JSONDecodeError, ValidationError):
                category = "llm_schema_error"
                self._record(success=False, latency=time.monotonic() - started, processor_type=processor_type, category=category)
            except ValueError:
                self._record(success=False, latency=time.monotonic() - started, processor_type=processor_type, category=category)
            raise RequiredLLMFailure(category)
        raise RequiredLLMFailure("llm_http_error")
