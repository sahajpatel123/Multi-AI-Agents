## Description

<!-- Please include a summary of the change and which issue is fixed. -->

Fixes # (issue)

## Type of Change

<!-- Please delete options that are not relevant. -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Security fix
- [ ] Documentation update

## Security Checklist

If applicable, please ensure:

- [ ] All new code is covered by tests
- [ ] `npm audit` passes (or vulnerabilities are documented as waived)
- [ ] `pip-audit` passes with no HIGH/CRITICAL findings
- [ ] gitleaks scan passes (no committed secrets)
- [ ] Pin floor guards are satisfied (no version regressions)
- [ ] Dependency review passes (no new HIGH/CRITICAL dependencies)
- [ ] CodeQL analysis reports no new HIGH/CRITICAL findings
- [ ] Source integrity check passes (no stray tokens / paste corruption)

## CI Checks Verified

- [ ] Backend tests pass (`pytest -q`)
- [ ] Frontend tests pass (`npm test`)
- [ ] TypeScript compilation passes (`npx tsc --noEmit`)
- [ ] Frontend build passes (`npm run build`)
- [ ] Workflow YAML validation passes (CI, CodeQL, release configs)

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published in downstream modules

## Further configuration

<!-- 
Additional configuration that may be needed based on the change type:
- If adding a new environment variable to `backend/arena/config.py`, also add to `backend/.env.example`
- If adding a new backend route, ensure it's mounted in `backend/main.py`
- If frontend changes, ensure proper type definitions in `src/types.ts` if needed
- For authentication-related changes, update `CONTRIBUTING.md` if needed
-->
