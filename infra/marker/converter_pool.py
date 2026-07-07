"""Bounded pool of Marker converters for safe concurrent OCR.

A Marker ``PdfConverter`` owns model state and is **not** safe to call from more
than one task at a time. The pool hands each converter to exactly one borrower via
``acquire()``, which does two things at once:

* it **caps concurrency** -- it is the semaphore, so at most ``size`` conversions
  run in parallel; and
* it **guarantees exclusive access** -- a converter is removed from the free queue
  before use and only returned afterwards, so two requests can never race on a
  shared model.

Concurrency == pool size == number of model copies resident in VRAM. Size it to
what the GPU can hold: each extra converter lets one more request overlap its
CPU-bound stages (PDF parse / render / postprocess) with another request's GPU work,
which is the whole point of Phase 1. A pool of 1 reproduces the old serial behaviour.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any, AsyncIterator, Callable


class ConverterPool:
    def __init__(self, build_fn: Callable[[], Any], size: int = 1) -> None:
        if size < 1:
            raise ValueError(f"pool size must be >= 1, got {size}")
        self._build_fn = build_fn
        self._size = size
        self._free: asyncio.Queue = asyncio.Queue()
        self._init_lock = asyncio.Lock()
        self._started = False

    @property
    def size(self) -> int:
        return self._size

    @property
    def available(self) -> int:
        """Number of converters not currently checked out."""
        return self._free.qsize()

    async def start(self) -> None:
        """Build all converters once. Idempotent and safe to call concurrently.

        Converters are built one at a time (each loads a full set of models) to avoid a
        VRAM spike from loading ``size`` model sets simultaneously.
        """
        if self._started:
            return
        async with self._init_lock:
            if self._started:
                return
            for _ in range(self._size):
                converter = await asyncio.to_thread(self._build_fn)
                self._free.put_nowait(converter)
            self._started = True

    @contextlib.asynccontextmanager
    async def acquire(self) -> AsyncIterator[Any]:
        """Borrow a converter for exclusive use, returning it on exit (even on error)."""
        if not self._started:
            await self.start()
        converter = await self._free.get()  # blocks until one is free -- the semaphore
        try:
            yield converter
        finally:
            self._free.put_nowait(converter)
