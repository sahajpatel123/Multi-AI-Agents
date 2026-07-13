# HANDOFF — Arena × Condura state ledger

> FOOTHPATH-style. Newest entries at the top. Append after every session that
> changes Condura integration status.

---

## Entry 2 — Implementation Phases 0–6 landed (2026-07-14)

**Status:** Capability taxonomy, 409 guards (flag-gated), Condura routes,
frontend CTA/badge/probe/handoff crypto, templates, ProductPage note.

### What works

- `arena/core/capabilities.py` — discriminated union + task heuristics
- Agent route guards on run/orchestrate/watchlist/refine/verify/challenge/rebuttal/feedback/live
- `CONDURA_HONEST_REJECTION_ENABLED` default off (staged rollout)
- `/api/condura/*` handoff mirror, drafts, migration flags
- Frontend: ConduraBadge, ConduraInstallCTA, probe, JCS+ECDSA handoff, Templates "On device"
- Tests: `test_capabilities.py`, `test_condura_migration.py`
- Demonstrative templates: open_in_linear, save_report_local, long_research_delegate (disabled)

### Still depends on Condura daemon

- Real `arena.handoff` / SSE / `arena.device.pair` implementation
- Until then: Path B (copy handoff / save draft) works; Path A needs Condura

### Next ops

- Enable flag for internal cohort when ready
- Run migration scan on deploy: `audit_existing_state_for_condura_impact(db)`

---

## Entry 1 — Spec locked (2026-07-14)

**Status:** Phase 0 complete. Spec docs committed. Implementation begins Phase 1.

### What works

- ADR-0001 accepted: network is the guarantee; browser is the bridge.
- INTEGRATION.md offers Condura the three-method API (handoff, events SSE, device.pair).
- CAPABILITY-REGISTRY.md lists web / condura / hybrid surfaces.
- Schema versioning (SemVer, lenient reads) locked before Condura ships against v1.

### What does not work yet

- No `capabilities.py` code.
- No 409 rejection path (feature flag not present).
- No Condura UI (badge, CTA, probe).
- No handoff crypto / streaming client.
- Condura daemon may not yet implement `arena.handoff` (out of Arena's control).

### Staged rollout plan (Phase 1+)

`CONDURA_HONEST_REJECTION_ENABLED` env var, default `false`.

| Cohort | Duration |
|---|---|
| Flag off | Until internal soak |
| Owner + internal | 24h |
| 1% paid | 24h |
| 10% paid | 48h |
| 100% | indefinite |

**Kill switch:** set `CONDURA_HONEST_REJECTION_ENABLED=false`.

**False positive:** web task gets 409. Rate > 1% → halt rollout.

### Open for Condura team

1. Accept / modify / reject INTEGRATION.md methods.
2. Confirm multi-consumer SSE fan-out.
3. Confirm TOFU `arena.device.pair` UX.

### Next

Phase 1: `capabilities.py`, route guards, migration scan, tests.
