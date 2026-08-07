# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CI status badges to README.md
- SECURITY.md with vulnerability reporting guidelines
- CODEOWNERS for automatic code review assignment
- CONTRIBUTING.md with development guidelines
- Release workflow for version-tagged builds
- `workflow_dispatch` triggers for manual CI runs
- PR diff size check for large PR warnings
- Summary steps at end of CI jobs
- `X-Request-ID` tracing middleware (request IDs on every response)
- Request ID surfaced in prompt, debate, and discuss SSE streams
- Request ID included in non-stream prompt responses and admin health detail
- Request ID included in Agent Mode run responses and frontend error messages
- Request ID shown in Arena, Discuss, and Debate stream error messages
- “Try again” button in the Arena error banner for quick retries
- “Try again” button in focused-chat error banners for history-safe retries
- Copy error buttons in Debate Mode error banners
- “Try again” buttons in Debate Mode error banners

### Changed
- Repaired CodeQL action tag after an invalid v5 bump (now pinned to v4)
- Upgraded actions/checkout from v4 to v7
- Optimized Dependabot schedule to daily security checks
- Updated postcss pin floor to 8.5.23 (security fix)
- Bumped cryptography to 50.0.0 and postcss to 8.5.26 (security fixes)
- Exposed `X-Request-ID` through CORS for browser clients

### Security
- Added gitleaks allowlists for test fixture API keys
- Fixed npm audit vulnerabilities (brace-expansion, js-yaml, postcss)
- Added comprehensive security floor guards for Python and Node.js

## [0.1.0] - 2026-08-07

### Added
- Initial release with multi-AI agent chatroom functionality
- 16 AI personas with distinct reasoning styles
- Backend: FastAPI with SQLAlchemy, Alembic migrations
- Frontend: React 18, TypeScript, Tailwind CSS, Vite
- Agent Mode with 8-stage research pipeline
- Debate and Discuss modes
- Watchlist, Saved responses, Rooms features
- Razorpay subscription support
- Model Context Protocol (MCP) integration
