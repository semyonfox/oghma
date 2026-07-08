import asyncio
import importlib
import sys
import types
from pathlib import Path

import pytest


MARKER_DIR = Path(__file__).resolve().parent
if str(MARKER_DIR) not in sys.path:
    sys.path.insert(0, str(MARKER_DIR))


class FakeFastAPI:
    def __init__(self, *args, **kwargs) -> None:
        self.routes = []

    def on_event(self, event):
        def decorate(func):
            return func

        return decorate

    def get(self, path):
        def decorate(func):
            self.routes.append(("GET", path, func))
            return func

        return decorate

    def post(self, path):
        def decorate(func):
            self.routes.append(("POST", path, func))
            return func

        return decorate


class FakeHTTPException(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class FakeJSONResponse:
    def __init__(self, content=None, status_code: int = 200) -> None:
        self.content = content
        self.status_code = status_code


def install_server_import_stubs(monkeypatch) -> None:
    fastapi = types.ModuleType("fastapi")
    fastapi.Depends = lambda dependency=None, **kwargs: dependency
    fastapi.FastAPI = FakeFastAPI
    fastapi.File = lambda default=None, **kwargs: default
    fastapi.Form = lambda default=None, **kwargs: default
    fastapi.Header = lambda default=None, **kwargs: default
    fastapi.HTTPException = FakeHTTPException
    fastapi.UploadFile = object
    fastapi.status = types.SimpleNamespace(HTTP_401_UNAUTHORIZED=401)

    responses = types.ModuleType("fastapi.responses")
    responses.JSONResponse = FakeJSONResponse

    uvicorn = types.ModuleType("uvicorn")
    uvicorn.run = lambda *args, **kwargs: None

    monkeypatch.setitem(sys.modules, "fastapi", fastapi)
    monkeypatch.setitem(sys.modules, "fastapi.responses", responses)
    monkeypatch.setitem(sys.modules, "uvicorn", uvicorn)


@pytest.fixture()
def server(monkeypatch):
    install_server_import_stubs(monkeypatch)
    sys.modules.pop("server", None)
    module = importlib.import_module("server")
    yield module
    sys.modules.pop("server", None)


def run(coro):
    return asyncio.run(coro)


def test_marker_token_dependency_is_noop_without_token(server, monkeypatch):
    monkeypatch.delenv("MARKER_API_TOKEN", raising=False)

    run(server.require_marker_token())


def test_marker_token_dependency_accepts_supported_headers(server, monkeypatch):
    monkeypatch.setenv("MARKER_API_TOKEN", "secret")

    run(server.require_marker_token(authorization="Bearer secret"))
    run(server.require_marker_token(authorization="bearer secret"))
    run(server.require_marker_token(x_marker_token="secret"))


def test_marker_token_dependency_rejects_bad_token(server, monkeypatch):
    monkeypatch.setenv("MARKER_API_TOKEN", "secret")

    with pytest.raises(server.HTTPException) as exc:
        run(server.require_marker_token(authorization="Bearer wrong"))

    assert exc.value.status_code == 401
    assert exc.value.detail == "invalid marker token"


def test_health_reports_starting_until_pool_ready(server):
    server._mark_pool_starting()

    response = run(server.health())
    assert response.status_code == 503
    assert response.content["status"] == "starting"
    assert response.content["ready"] is False

    server._mark_pool_ready()
    response = run(server.root_health())
    assert response.status_code == 200
    assert response.content["status"] == "ready"
    assert response.content["ready"] is True


def test_warm_pool_failure_is_visible_in_health(server):
    class FailingPool:
        size = 1
        available = 0

        async def start(self):
            raise RuntimeError("model load failed")

    server._pool = FailingPool()

    run(server._warm_pool())

    response = run(server.health())
    assert response.status_code == 503
    assert response.content["status"] == "failed"
    assert response.content["pool"]["error"] == "model load failed"


def test_warm_pool_success_marks_health_ready(server):
    class ReadyPool:
        size = 2
        available = 2

        async def start(self):
            return None

    server._pool = ReadyPool()
    server._mark_pool_starting()

    run(server._warm_pool())

    response = run(server.health())
    assert response.status_code == 200
    assert response.content["status"] == "ready"
    assert response.content["pool"]["size"] == 2
