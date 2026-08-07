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

### Changed
- Updated CodeQL workflow from v3 to v5
- Upgraded actions/checkout from v4 to v7
- Optimized Dependabot schedule to daily security checks
- Updated postcss pin floor to 8.5.23 (security fix)

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