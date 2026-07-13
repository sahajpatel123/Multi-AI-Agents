"""Unit tests for arena.core.llm_retry."""

import asyncio

import pytest

from arena.core.llm_retry import is_retryable, retry_async


class _FakeAPIError(Exception):
    def __init__(self, status_code: int):
        super().__init__(f"fake {status_code}")
        self.status_code = status_code


@pytest.mark.asyncio
async def test_retry_succeeds_on_second_attempt():
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise ConnectionError("transient")
        return "ok"

    result = await retry_async(flaky, max_attempts=3, base_delay=0.001)
    assert result == "ok"
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_retry_gives_up_after_max_attempts():
    calls = {"n": 0}

    async def always_fails():
        calls["n"] += 1
        raise ConnectionError("never works")

    with pytest.raises(ConnectionError):
        await retry_async(always_fails, max_attempts=3, base_delay=0.001)
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_retry_does_not_retry_non_transient():
    calls = {"n": 0}

    async def bad_input():
        calls["n"] += 1
        raise ValueError("bad input — won't get better")

    with pytest.raises(ValueError):
        await retry_async(bad_input, max_attempts=3, base_delay=0.001)
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_retry_calls_on_retry_callback():
    seen = []
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise ConnectionError("transient")
        return "ok"

    def on_retry(attempt, exc, delay):
        seen.append((attempt, type(exc).__name__, delay))

    await retry_async(flaky, max_attempts=3, base_delay=0.01, on_retry=on_retry)
    assert len(seen) == 1
    assert seen[0][0] == 1
    assert seen[0][1] == "ConnectionError"


def test_is_retryable_for_status_codes():
    assert is_retryable(_FakeAPIError(503)) is True
    assert is_retryable(_FakeAPIError(500)) is True
    assert is_retryable(_FakeAPIError(429)) is True
    assert is_retryable(_FakeAPIError(408)) is True
    # 4xx other than 408/429 are not retryable.
    assert is_retryable(_FakeAPIError(400)) is False
    assert is_retryable(_FakeAPIError(401)) is False
    assert is_retryable(_FakeAPIError(403)) is False
    assert is_retryable(_FakeAPIError(404)) is False


def test_is_retryable_for_plain_exceptions():
    assert is_retryable(ConnectionError("x")) is True
    assert is_retryable(TimeoutError("x")) is True
    assert is_retryable(ValueError("bad")) is False
    assert is_retryable(KeyError("x")) is False