"""Tests for Content-Disposition / download filename sanitization."""

from arena.core.http_headers import content_disposition_attachment, safe_download_filename


def test_safe_download_filename_strips_path_and_quotes():
    assert safe_download_filename('../../evil"\r\nX: y.pdf') == "evil-X-y.pdf"
    assert safe_download_filename("arena-report-abcd1234.pdf") == "arena-report-abcd1234.pdf"


def test_safe_download_filename_fallback():
    assert safe_download_filename("///") == "download"
    assert safe_download_filename("") == "download"


def test_content_disposition_attachment_quoted():
    assert content_disposition_attachment("report.pdf") == 'attachment; filename="report.pdf"'
    # No raw quote left to break out of the header value.
    assert '"' not in content_disposition_attachment('a"b.pdf').split("filename=")[1][1:-1]
