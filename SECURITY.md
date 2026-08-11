# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| main branch | ✅   |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in this project, please report it responsibly.

### How to Report

**Do not** open a public GitHub issue for security vulnerabilities.

Instead, please report via one of the following methods:

1. **GitHub Security Advisory** (Preferred): Use the [GitHub Security Advisories](https://github.com/sahajpatel123/Multi-AI-Agents/security/advisories) tab to submit a vulnerability report.

2. **Email**: Contact the maintainers directly at the project's maintainer email.

### What to Include

When reporting a vulnerability, please include:

- A description of the vulnerability
- Steps to reproduce (if possible)
- Potential impact
- Any suggested remediation (optional)
- Your contact information for follow-up

### Response Timeline

- **Initial response**: Within 48 hours
- **Acknowledgement**: We will acknowledge receipt of your report
- **Investigation**: We will investigate and validate the vulnerability
- **Resolution**: We will work on a fix and coordinate disclosure

### Disclosure Policy

- We ask that you give us at least 7 days to investigate and resolve the issue before public disclosure
- We will credit you in the security advisory (if you wish to be credited)
- We will notify the community when a fix has been deployed

## Security Measures

This project implements the following security practices:

- **Dependency scanning**: pip-audit for Python, npm audit for Node.js, plus a
  scheduled dependency-security workflow that catches newly disclosed
  vulnerabilities even when the repository has no recent commits
- **Dependency review**: GitHub Actions dependency-review gate fails PRs that
  introduce HIGH/CRITICAL dependency vulnerabilities
- **Pin floors**: CI guards the minimum security-required versions for
  critical Python and Node packages
- **Dependency consistency**: `pip check` runs in backend CI to catch
  dependency resolution inconsistencies
- **Dependency automation**: Dependabot covers pip, npm, and GitHub Actions
  on a weekly schedule with security labels
- **Secret scanning**: gitleaks with CI integration
- **Static code analysis**: GitHub CodeQL (Python and JavaScript/TypeScript)
- **Security headers**: CSP, HSTS (production), X-Frame-Options, COOP/COEP,
  and other defense-in-depth headers on every response
- **Content Security Policy**: API responses set a strict CSP (no unsafe-eval,
  no object-src, frame-ancestors none)
- **CI hardening**: every CI/CodeQL/release job has an explicit timeout and
  least-privilege GitHub token permissions where possible; in-flight runs are
  not cancelled by newer pushes so each commit gets a trustworthy result
- **Workflow hardening**: CI and release runs execute a static workflow-security
  gate that enforces explicit least-privilege permissions (no
  `write-all`/`read-all` wildcards), job timeouts, no dangerous triggers or
  `secrets: inherit`, stable version/SHA pins on every third-party action,
  minimum version floors for security-critical actions, and
  `persist-credentials: false` on every checkout so the runner never leaves the
  GitHub token in the local Git configuration
- **Pre-commit enforcement**: CI runs the repo's pre-commit hooks (lint,
  formatting, secret scanning, and debug-statement checks)
- **Source integrity**: CI scans for stray-token/paste corruption and runs
  `git diff --check` on PR/push diffs
- **Review coverage**: CODEOWNERS requires owner review for CI/security config
  and security test files
- **Request tracing**: every response carries `X-Request-ID`; the same ID is
  surfaced in SSE streams and error messages for end-to-end correlation
- **CORS**: locked to an environment allowlist; only `X-Request-ID` is
  exposed for browser-side correlation
- **Security advisories**: vulnerability reports are handled through GitHub
  Security Advisories with a 48-hour initial response target
- **Password storage**: bcrypt 12-round with SHA-256 prehash; legacy verify
  paths are kept only for backwards compatibility
- **Input validation**: Request size limits, input sanitization
- **Authentication**: JWT with bcrypt passwords, token revocation
- **Rate limiting**: IP-based and user-based rate limits
- **Security headers**: CSP, X-Frame-Options, COOP, COEP, HSTS
- **Webhook verification**: HMAC-SHA256 for Razorpay webhooks

## Security Invariants

- Requests are limited to 10 KB (default) or 10 MB for file uploads
- CORS is locked to an allowlist via `ALLOWED_ORIGINS` environment variable
- All responses include security headers (HSTS in production, X-Frame-Options DENY, etc.)
- Rate limits apply globally (100/min/IP) and per-user based on tier
- Razorpay webhooks are verified via HMAC-SHA256
- Passwords use bcrypt 12-round with SHA-256 prehash
- Prompt injection detection includes 17 known phrases and LLM toxicity checks

## Contact

For security concerns, please use the GitHub Security Advisory tab or contact the maintainers directly.

---

*This security policy is provided as a reference for responsible disclosure and does not constitute a legal agreement.*
