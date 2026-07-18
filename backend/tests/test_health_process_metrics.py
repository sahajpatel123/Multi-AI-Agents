"""Process-resource metrics surfaced by /api/health/detailed."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from arena.core import observability


def test_detailed_includes_process_resource_fields():
    body = observability.get_health_data_detailed(db_connected=True)
    for field in ("process_rss_bytes", "process_open_fds", "host_cpu_count"):
        assert field in body, f"missing {field!r} in detailed payload"
        # None is acceptable when the platform doesn't expose the metric
        # but it must never be a string/int that would crash JSON parsing.
        value = body[field]
        assert value is None or isinstance(value, int)


def test_detailed_metrics_strict_superset_of_public():
    from arena.core.observability import get_health_data, get_health_data_detailed

    public = set(get_health_data(db_connected=True).keys())
    detailed = set(get_health_data_detailed(db_connected=True).keys())
    assert public.issubset(detailed)
    assert detailed - public >= {
        "process_rss_bytes",
        "process_open_fds",
        "host_cpu_count",
    }


def test_rss_falls_back_to_proc_when_psutil_missing(monkeypatch):
    monkeypatch.setattr(
        observability,
        "_read_open_fd_count",
        lambda: None,
    )
    monkeypatch.setattr(
        observability,
        "_read_cpu_count",
        lambda: 4,
    )
    with patch("builtins.__import__", side_effect=_fail_psutil):
        rss = observability._read_rss_bytes()
    assert rss is None or isinstance(rss, int) and rss > 0


def _fail_psutil(name, globals=None, locals=None, fromlist=(), level=0):
    if name == "psutil":
        raise ImportError("psutil unavailable in this test")
    return __import__(name, globals, locals, fromlist, level)


def test_rss_uses_psutil_when_available(monkeypatch):
    class FakeProcess:
        def __init__(self, pid):
            self.pid = pid

        def memory_info(self):
            class Info:
                rss = 4242

            return Info()

    fake_psutil = type(
        "FakePsutil",
        (),
        {"Process": lambda pid: FakeProcess(pid)},
    )
    monkeypatch.setitem(__import__("sys").modules, "psutil", fake_psutil)
    assert observability._read_rss_bytes() == 4242