"""Object transfers and the v1 result envelope shared by queued workers."""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import urllib.request
from pathlib import Path
from typing import Any, Mapping
from urllib.error import HTTPError
from urllib.parse import urlsplit
from uuid import UUID

import httpx


logger = logging.getLogger(__name__)


def positive_int_env(name: str, fallback: int) -> int:
    try:
        value = int(os.getenv(name, ""))
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def bool_option(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off", ""}:
            return False
    return fallback


def upload_suffix(filename: str | None) -> str:
    suffix = Path(filename or "document.pdf").suffix.lower()
    return suffix if suffix and len(suffix) <= 16 else ".pdf"


def route_to_cpu(
    path: str, payload: Mapping[str, Any], options: Mapping[str, Any]
) -> tuple[dict[str, Any] | None, bool]:
    """Return the CPU acknowledgement and whether an unacknowledged write is possible."""
    if not bool_option(os.getenv("MARKER_CPU_ROUTE", "off")) or Path(path).suffix != ".pdf":
        return None, False

    try:
        classification = subprocess.run(
            ["marker_classify", path], capture_output=True, check=True, timeout=120
        )
        document = json.loads(classification.stdout)
        if document["suggested_route"] != "cpu" or document["math_glyph_pages"] != 0:
            return None, False
    except (OSError, subprocess.SubprocessError, ValueError, TypeError, KeyError) as error:
        logger.warning("Marker CPU classification failed, using GPU error=%s", type(error).__name__)
        return None, False

    endpoint = os.getenv("MARKER_CPU_WORKER_URL", "").strip().rstrip("/")
    token = os.getenv("MARKER_CPU_WORKER_TOKEN", "").strip()
    if not endpoint or not token:
        logger.warning("Marker CPU endpoint or token missing, using GPU")
        return None, False

    request = {key: payload[key] for key in ("requestId", "resultKey", "sourceUrl", "resultUrl")}
    request["filename"] = "document.pdf"
    request["options"] = {**options, "mode": "no_ocr" if options.get("mode") == "no_ocr" else "fast"}
    try:
        response = httpx.post(
            f"{endpoint}/marker/job",
            json=request,
            headers={"Authorization": f"Bearer {token}"},
            timeout=600,
            trust_env=False,
        )
        response.raise_for_status()
        result = response.json()
        if (
            not isinstance(result, dict)
            or result.get("success") is not True
            or result.get("requestId") != request["requestId"]
            or result.get("resultKey") != request["resultKey"]
        ):
            raise ValueError("CPU worker returned an invalid job result")
        return result, False
    except (httpx.HTTPError, httpx.InvalidURL, ValueError) as error:
        # a lost CPU response can leave a result at this key. upload() gives
        # either worker's first successful write precedence
        logger.warning("Marker CPU worker failed, using GPU error=%s", type(error).__name__)
        result_may_exist = not (
            isinstance(error, (httpx.ConnectError, httpx.ConnectTimeout, httpx.InvalidURL))
            or (isinstance(error, httpx.HTTPStatusError) and error.response.status_code < 500)
        )
        return None, result_may_exist


def allowed_object_hosts() -> set[str]:
    return {
        host.strip().lower()
        for host in os.getenv("MARKER_ALLOWED_OBJECT_HOSTS", "").split(",")
        if host.strip()
    }


def validate_request_identity(payload: Mapping[str, Any]) -> tuple[str, str]:
    request_id = payload.get("requestId")
    result_key = payload.get("resultKey")
    if not isinstance(request_id, str):
        raise ValueError("requestId is required")
    try:
        canonical_request_id = str(UUID(request_id))
    except (TypeError, ValueError) as error:
        raise ValueError("requestId must be a canonical UUID") from error
    if request_id != canonical_request_id:
        raise ValueError("requestId must be a canonical UUID")
    expected_result_key = f"marker-results/{canonical_request_id}.json"
    if result_key != expected_result_key:
        raise ValueError("resultKey does not match requestId")
    return canonical_request_id, expected_result_key


def validate_object_url(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field} is required")
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError(f"{field} must use HTTPS")
    hosts = allowed_object_hosts()
    if not hosts:
        raise ValueError("MARKER_ALLOWED_OBJECT_HOSTS is not configured")
    if parsed.hostname.lower() not in hosts:
        raise ValueError(f"{field} host is not approved")
    return value


class ObjectRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> urllib.request.Request | None:
        validate_object_url(new_url, "redirectUrl")
        return super().redirect_request(
            request,
            file_pointer,
            code,
            message,
            headers,
            new_url,
        )


OBJECT_OPENER = urllib.request.build_opener(ObjectRedirectHandler())


def download(url: str, path: str) -> int:
    limit = positive_int_env("MARKER_MAX_SOURCE_BYTES", 250 * 1024 * 1024)
    total = 0
    with OBJECT_OPENER.open(
        urllib.request.Request(url, method="GET"),
        timeout=positive_int_env("MARKER_TRANSFER_TIMEOUT_SECONDS", 600),
    ) as response:
        with open(path, "wb") as handle:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > limit:
                    raise ValueError(
                        f"source exceeds MARKER_MAX_SOURCE_BYTES={limit}"
                    )
                handle.write(chunk)
    if total == 0:
        raise ValueError("source object is empty")
    return total


def upload(url: str, body: bytes) -> bool:
    """Write once. A 412 means another worker already owns this result key."""

    request = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Content-Type": "application/json",
            "If-None-Match": "*",
        },
    )
    try:
        with OBJECT_OPENER.open(
            request,
            timeout=positive_int_env("MARKER_TRANSFER_TIMEOUT_SECONDS", 600),
        ) as response:
            response.read(1024)
        return True
    except HTTPError as error:
        if error.code == 412:
            return False
        raise


def build_result_envelope(
    converted: Mapping[str, Any], request_id: str, result_key: str | None
) -> dict[str, Any]:
    output = converted.get("output")
    if not isinstance(output, str) or not output.strip():
        raise ValueError("Marker output is empty")
    return {
        "schema_version": 1,
        "request_id": request_id,
        "result_key": result_key,
        "success": True,
        "format": "markdown",
        "output": output,
        "page_range": converted.get("page_range"),
        "images": converted.get("images", {}),
        "metadata": converted.get("metadata"),
    }


def safe_error(error: Exception) -> str:
    """Avoid leaking signed object URLs through provider error logs/webhooks."""

    message = str(error)
    return re.sub(r"https?://[^\s'\"<>]+", "[redacted-url]", message)[:1_000] or type(error).__name__
