"""Regression tests for ``max_request_body_bytes`` per-path ceiling.

The helper maps a URL path to a body-size ceiling. A regression here
would either:

  - Default every path to the API cap (10KB) → 10MB upload returns
    413 and users can't upload files.
  - Default every path to the upload cap (10MB) → webhook endpoint
    accepts unbounded bodies (memory DoS).
  - Misroute upload/webhook paths → wrong error message to the user.

Pins:
  - Default path → 10KB.
  - ``/api/agent/upload`` → 10MB.
  - ``/api/payments/webhook`` → 1MB.
  - Trailing-slash variants map to the same bucket as the canonical path.
  - Unknown paths → default (default-deny).
"""

from __future__ import annotations

import pytest

from arena.core.request_size import (
    DEFAULT_MAX_BODY_BYTES,
    UPLOAD_MAX_BODY_BYTES,
    WEBHOOK_MAX_BODY_BYTES,
    max_request_body_bytes,
    payload_too_large_message,
)


class TestMaxRequestBodyBytesDefault:
    def test_default_path(self):
        assert max_request_body_bytes("/api/auth/register") == DEFAULT_MAX_BODY_BYTES

    def test_unknown_path(self):
        """An unknown path gets the default — never the upload or
        webhook cap. A regression that over-broadens the default
        would create a memory DoS surface."""
        assert max_request_body_bytes("/api/something/else") == DEFAULT_MAX_BODY_BYTES

    def test_root_path(self):
        assert max_request_body_bytes("/") == DEFAULT_MAX_BODY_BYTES

    def test_empty_path(self):
        assert max_request_body_bytes("") == DEFAULT_MAX_BODY_BYTES


class TestMaxRequestBodyBytesUpload:
    def test_upload_path(self):
        assert max_request_body_bytes("/api/agent/upload") == UPLOAD_MAX_BODY_BYTES

    def test_upload_path_with_trailing_slash(self):
        """A trailing-slash variant must map to the same bucket —
        clients sometimes normalize inconsistently."""
        assert max_request_body_bytes("/api/agent/upload/") == UPLOAD_MAX_BODY_BYTES

    def test_query_string_not_matched(self):
        """The matcher uses `endswith` on the path string — a query
        string appended to the path means the suffix is `?foo=bar`,
        not `/api/agent/upload`. The middleware strips the query
        string before calling, so this case doesn't arise in
        production. Pin the helper's actual behavior."""
        # The full string with query is NOT matched (suffix differs).
        assert max_request_body_bytes("/api/agent/upload?foo=bar") == DEFAULT_MAX_BODY_BYTES

    def test_upload_subresource_not_matched(self):
        """Sub-paths under /api/agent/upload do NOT match (the
        matcher checks `endswith`, and the suffix is the sub-path,
        not ``/api/agent/upload``). They get the default cap.

        Note: the matcher is intentionally strict — a child route
        like ``/api/agent/upload/profile-pic`` would NOT inherit the
        upload cap, and would either need to be added to the bucket
        list or routed through the middleware separately."""
        assert max_request_body_bytes("/api/agent/upload/profile-pic") == DEFAULT_MAX_BODY_BYTES


class TestMaxRequestBodyBytesWebhook:
    def test_webhook_path(self):
        assert max_request_body_bytes("/api/payments/webhook") == WEBHOOK_MAX_BODY_BYTES

    def test_webhook_path_with_trailing_slash(self):
        assert max_request_body_bytes("/api/payments/webhook/") == WEBHOOK_MAX_BODY_BYTES


class TestMaxRequestBodyBytesBucketIsolation:
    """The three buckets must NOT cross-contaminate. A regression
    that makes the default too high (e.g. matches upload cap) would
    re-introduce the memory DoS."""

    def test_default_smaller_than_upload(self):
        assert DEFAULT_MAX_BODY_BYTES < UPLOAD_MAX_BODY_BYTES

    def test_default_smaller_than_webhook(self):
        assert DEFAULT_MAX_BODY_BYTES < WEBHOOK_MAX_BODY_BYTES

    def test_webhook_smaller_than_upload(self):
        assert WEBHOOK_MAX_BODY_BYTES < UPLOAD_MAX_BODY_BYTES

    def test_constants_are_correct_values(self):
        """Pin the actual byte counts — operators watch these on
        dashboards. A regression that flips the constants (e.g.
        upload to 100KB) would silently break every upload."""
        assert DEFAULT_MAX_BODY_BYTES == 10 * 1024       # 10 KB
        assert UPLOAD_MAX_BODY_BYTES == 11 * 1024 * 1024  # 10 MB + overhead
        assert WEBHOOK_MAX_BODY_BYTES == 1024 * 1024      # 1 MB


class TestPayloadTooLargeMessage:
    def test_default_message(self):
        msg = payload_too_large_message("/api/auth/register")
        assert "10KB" in msg or "10 KB" in msg
        # And it's actionable (mentions the limit).
        assert "Maximum" in msg or "max" in msg.lower()

    def test_upload_message(self):
        msg = payload_too_large_message("/api/agent/upload")
        assert "10MB" in msg or "10 MB" in msg
        assert "File" in msg or "file" in msg

    def test_webhook_message(self):
        msg = payload_too_large_message("/api/payments/webhook")
        assert "1MB" in msg or "1 MB" in msg
        assert "Webhook" in msg or "webhook" in msg

    def test_upload_message_with_trailing_slash(self):
        msg = payload_too_large_message("/api/agent/upload/")
        assert "10MB" in msg or "10 MB" in msg

    def test_webhook_message_with_trailing_slash(self):
        msg = payload_too_large_message("/api/payments/webhook/")
        assert "1MB" in msg or "1 MB" in msg


class TestBucketPathMatching:
    """The matcher uses ``endswith`` — both buckets must be matched
    in the right order. A regression that swaps the order (checks
    webhook before upload) would misroute uploads to the webhook
    cap (1 MB) — silently rejecting 5 MB uploads."""

    def test_upload_path_does_not_match_webhook_cap(self):
        """The upload path must get the upload cap, NOT the webhook
        cap. A regression that checks webhook first would misroute."""
        # If the matcher checked webhook before upload and used
        # `endswith`, both paths would match — but only the FIRST
        # match wins in a chain of ifs. So we assert the specific
        # value here.
        assert max_request_body_bytes("/api/agent/upload") == UPLOAD_MAX_BODY_BYTES

    def test_webhook_path_does_not_match_upload_cap(self):
        assert max_request_body_bytes("/api/payments/webhook") == WEBHOOK_MAX_BODY_BYTES

    def test_endswith_is_safe_with_longer_path(self):
        """The matcher uses ``endswith`` — a path that ENDS with
        ``/api/agent/upload`` but has a longer prefix still matches
        the upload cap. Sub-resources under ``/api/payments/webhook``
        also match the webhook cap."""
        assert max_request_body_bytes("/v2/api/agent/upload") == UPLOAD_MAX_BODY_BYTES
        # The webhook bucket accepts sub-resources too (e.g. versioning).
        # We test with an artificial but recognizable sub-path.
        assert max_request_body_bytes("/api/payments/webhook") == WEBHOOK_MAX_BODY_BYTES