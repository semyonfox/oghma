"""Tests for ConverterPool.

These exercise the real pool logic (the thing Phase 1 adds). The Marker converter is
stood in for by a lightweight fake, since the property under test is the pool's
concurrency/exclusivity behaviour, not Marker's OCR.
"""

import asyncio
import itertools

import pytest

from converter_pool import ConverterPool

_ids = itertools.count(1)


class FakeConverter:
    """Stand-in for a Marker PdfConverter: a stateful object that must only be used
    by one borrower at a time. Each instance has a unique id so a test can detect if
    the same converter is ever handed to two borrowers simultaneously."""

    def __init__(self) -> None:
        self.id = next(_ids)


def _builder(counter: dict | None = None):
    def build() -> FakeConverter:
        if counter is not None:
            counter["built"] += 1
        return FakeConverter()

    return build


def test_rejects_size_below_one():
    with pytest.raises(ValueError):
        ConverterPool(_builder(), size=0)


def test_start_builds_size_converters_and_is_idempotent():
    async def run():
        counter = {"built": 0}
        pool = ConverterPool(_builder(counter), size=3)

        await pool.start()
        assert counter["built"] == 3
        assert pool.available == 3

        await pool.start()  # second call must not rebuild
        assert counter["built"] == 3
        assert pool.available == 3

    asyncio.run(run())


def test_concurrent_start_builds_once():
    # Real scenario: the startup warm-task and the first request can both call start().
    # The init lock must ensure the pool is built exactly once.
    async def run():
        counter = {"built": 0}
        pool = ConverterPool(_builder(counter), size=3)

        await asyncio.gather(*(pool.start() for _ in range(5)))

        assert counter["built"] == 3  # not 15
        assert pool.available == 3

    asyncio.run(run())


def test_acquire_autostarts_pool():
    async def run():
        counter = {"built": 0}
        pool = ConverterPool(_builder(counter), size=2)

        async with pool.acquire() as conv:  # no explicit start()
            assert isinstance(conv, FakeConverter)
        assert counter["built"] == 2  # whole pool built on first acquire

    asyncio.run(run())


def test_acquire_checks_out_and_returns():
    async def run():
        pool = ConverterPool(_builder(), size=1)
        assert pool.available == 0  # not started yet

        async with pool.acquire() as conv:
            assert isinstance(conv, FakeConverter)
            assert pool.available == 0  # checked out while in use
        assert pool.available == 1  # returned on exit

    asyncio.run(run())


def test_converter_returned_even_on_error():
    async def run():
        pool = ConverterPool(_builder(), size=1)

        with pytest.raises(RuntimeError):
            async with pool.acquire():
                raise RuntimeError("boom")

        # The converter must be returned despite the exception (no leak / deadlock).
        assert pool.available == 1
        async with pool.acquire() as conv:
            assert isinstance(conv, FakeConverter)

    asyncio.run(run())


def test_never_exceeds_size_and_handoff_is_exclusive():
    """Core safety property: at most `size` borrowers at once, and no single
    converter is ever held by two borrowers simultaneously."""

    async def run():
        size = 4
        pool = ConverterPool(_builder(), size=size)
        state = {"current": 0, "max": 0}
        in_use: set[int] = set()
        guard = asyncio.Lock()

        async def worker():
            async with pool.acquire() as conv:
                async with guard:
                    assert conv.id not in in_use, "converter handed to two borrowers at once"
                    in_use.add(conv.id)
                    state["current"] += 1
                    state["max"] = max(state["max"], state["current"])
                await asyncio.sleep(0.01)  # hold it so concurrency is forced
                async with guard:
                    in_use.discard(conv.id)
                    state["current"] -= 1

        await asyncio.gather(*(worker() for _ in range(40)))

        assert state["max"] == size  # 40 tasks contend, so we reach the cap exactly
        assert pool.available == size  # everything returned

    asyncio.run(run())


def test_size_one_serializes():
    async def run():
        pool = ConverterPool(_builder(), size=1)
        state = {"current": 0, "max": 0}

        async def worker():
            async with pool.acquire():
                state["current"] += 1
                state["max"] = max(state["max"], state["current"])
                await asyncio.sleep(0.005)
                state["current"] -= 1

        await asyncio.gather(*(worker() for _ in range(10)))
        assert state["max"] == 1  # strictly one-at-a-time

    asyncio.run(run())
