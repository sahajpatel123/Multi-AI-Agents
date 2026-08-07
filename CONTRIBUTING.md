# Contributing to Arena

Thank you for your interest in contributing to Arena! This document provides guidelines to help you contribute effectively.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Security](#security)
- [License](#license)

## Code of Conduct

This project follows the principles of good software engineering and security best practices. Please be respectful and collaborative in all interactions.

## Getting Started

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Development Setup

### Backend (Python)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install pytest pytest-asyncio httpx
alembic upgrade head
cp .env.example .env
# Edit .env with ANTHROPIC_API_KEY and SECRET_KEY
```

### Frontend (Node.js)

```bash
cd web/frontend
npm install
npm run dev
```

## Coding Standards

### Backend (Python)

- Use Python 3.11+
- Follow PEP 8 style guidelines
- Use type hints for all function signatures
- Write docstrings for all public functions and classes
- Use `async`/`await` for asynchronous operations
- Test with `pytest -q`

### Frontend (TypeScript/React)

- Use TypeScript for all new code
- Follow the existing component patterns
- Use `apiFetch` from `src/lib/apiFetch.ts` for backend calls
- Use the shared clipboard helper from `src/lib/clipboard.ts`
- Test with `npm test` (Vitest)

## Testing

### Backend

```bash
cd backend
python -m pytest -q  # Run all tests
python -m compileall -q arena  # Compile check
```

### Frontend

```bash
cd web/frontend
npm test  # Vitest
npm run build  # Production build
```

## Pull Request Process

1. **Before submitting a PR**:
   - Run all tests locally
   - Ensure CI passes (we check pip-audit, npm audit, gitleaks)
   - Follow the existing code style
   - Add tests for new functionality

2. **PR Requirements**:
   - At least one approval from a code owner
   - CI must pass (all checks)
   - Keep PRs small and focused (<1000 lines changed preferred)

3. **PR Description**:
   - Use clear, concise commit messages
   - Reference any related issues with `Fixes #123`
   - Describe what changed and why

## Security

- **Never commit secrets** - Use `.env.example` as a template
- **All PRs are scanned** by:
  - pip-audit (Python dependencies)
  - npm audit (Node.js dependencies)
  - gitleaks (secret scanning)
  - GitHub CodeQL (static analysis)
- Pin-floor guards prevent regression to insecure package versions
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

### Security Invariants (Do Not Regress)

- Request size limit: 10 KB default, 10 MB file uploads
- CORS locked to allowlist via `ALLOWED_ORIGINS`
- Security headers on all responses (CSP, X-Frame-Options, HSTS, etc.)
- Per-IP rate limit: 100/min
- bcrypt 12-round + SHA-256 prehash for passwords
- Webhook verification via HMAC-SHA256

## Questions or Issues?

- Check existing issues before creating a new one
- Read [AGENTS.md](AGENTS.md) for architecture context
- See [README.md](README.md) for user-facing documentation

---

*Thank you for contributing to making Arena better!*