# HANDOFF — Arena × Condura state ledger

> FOOTHPATH-style. Newest entries at the top. Append after every session that
> changes Condura integration status.

---

## Entry 3 — Retention, metrics, a11y, rollout docs (2026-07-14)

**Status:** Reconciliation passes now include retention enforcement (purge
expired terminal rows per retention_class horizon). Metrics endpoint wired.
CTA modal gets focus-trap + Escape + aria-labelledby. Rollout commands
documented.

### Retention

- `condura_reconciler.purge_expired_handoffs(db)` — called every sweep.
- `standard` retention: 180d (matches PLUS agent history). `delegate`: 365d.
- Only terminal rows purged (complete/failed/cancelled/stream_lost/reconcile_needed).
- HandoffEvent rows cascade-deleted with parent.

### Metrics

- `GET /api/condura/metrics` — returns `admin_metrics_payload()` telemetry
  snapshot. Requires auth. Plan: add admin-only guard when RBAC ships.

### a11y on CTA

- `aria-labelledby="condura-cta-title"` on dialog, `id` on h2 title.
- Escape key closes modal.
- Basic focus trap: primary button auto-focused on open; Tab cycles between
  primary button and Close button.

### How to enable the flag (Render)

```bash
# Set in Render Dashboard → Environment → Environment Variables
CONDURA_HONEST_REJECTION_ENABLED = true
```

Verify it took: `GET /api/health` does not expose it. After setting, send a
test request to `/api/agent/run` with `task: "Open Linear and create a ticket"`
and check for HTTP 409.

### How to run the migration scan

The scan is idempotent and safe to run multiple times. It currently has no
auto-trigger on deploy. Run manually in a Render shell:

```bash
python -c "
from arena.database import SessionLocal
from arena.core.migration import audit_existing_state_for_condura_impact
db = SessionLocal()
try:
    result = audit_existing_state_for_condura_impact(db)
    print(result)
finally:
    db.close()
"
```

### How to monitor after flag flip

```bash
curl -H "Authorization: Bearer <token>" https://<render-url>/api/condura/metrics
```

Key signals after rollout:
- `capability_guard_decisions_total{decision=reject}` — should be near zero
  initially. If it spikes, review the rejection patterns.
- `capability_guard_decisions_total{decision=fallback}` — should drop to
  zero after the flag is on; each fallback means the flag was off.
- `handoffs_dispatched_total` — real human handoffs after onboarding.
- `pairing_mismatch_total` — re-pair rate; high = UX problem with session keys.

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
