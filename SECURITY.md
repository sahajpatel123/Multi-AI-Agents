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

- **Dependency scanning**: pip-audit for Python, npm audit for Node.js
- **Secret scanning**: gitleaks with CI integration
- **Static code analysis**: GitHub CodeQL (Python and JavaScript/TypeScript)
- **Request tracing**: every response carries `X-Request-ID`; the same ID is
  surfaced in SSE streams and error messages for end-to-end correlation
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
