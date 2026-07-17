# ADR-0001: Arena × Condura Integration

- **Status**: Accepted
- **Date**: 2026-07-14
- **Deciders**: Product owner (Sahaj), Arena AI Manager
- **Supersedes**: —
- **Superseded by**: —

---

## Context

Arena is a web product (React + FastAPI on Render). Condura (formerly Synaptic)
is a free, local-first, OS-native AI agent that lives on the user's computer.
Arena's Agent mode must support capability-gated execution: pure web work stays
on Arena; work that needs the user's machine is rejected on web and handed off
to Condura. The products must not merge monorepos, installers, or cloud desktop
VMs.

## Decision

### 1. Network topology is the security guarantee

Arena runs on Render. Condura runs on `127.0.0.1:18600` (user's machine).
There is no IP route from the cloud to the user's loopback. Arena's server
**cannot** perform computer-use. The browser is the only actor that straddles
both trust domains and is therefore the handoff bridge.

### 2. Capability taxonomy (discriminated union)

Every Agent action is tagged with one of:

| Tag | Meaning |
|---|---|
| `web` | Pure server-side work. No machine needed. |
| `condura` | Needs the user's machine. Server rejects with HTTP 409. |
| `hybrid_prep` | Arena plans; Condura executes synchronously. Browser-mediated stream. |
| `hybrid_delegate` | Condura runs a long loop; Arena watches via stream + reconciler. |

Implemented as four frozen Pydantic models (`WebCapability`,
`ConduraCapability`, `HybridPrepCapability`, `HybridDelegateCapability`)
with a non-Web mixin that enforces `args_schema is not None`.

### 3. Handoff is streaming-first, browser-mediated

1. Browser signs a payload (ECDSA P-256, sessionStorage key, RFC 8785 JCS).
2. Browser POSTs to Condura (`arena.handoff`) → receives `{run_id}` immediately.
3. Browser opens SSE `GET .../runs/<run_id>/events` (separate connection).
4. Browser forwards each event to Arena (`POST /api/condura/handoff/<id>/events`).
5. Arena stores events in a UX mirror (`HandoffRecord` / `HandoffEvent`).
   Condura's audit log is the system of record.

### 4. Honest rejection, not theater

When a request needs Condura and the feature flag is on, Arena returns:

```json
{
  "error": "requires_local_execution",
  "execution_environment": "condura",
  "message": "This task needs your machine. Powered by Condura.",
  "install_url": "https://condura.app",
  "handoff_spec": "arena.handoff.v1"
}
```

No fake local control in the browser. No cloud desktop VMs.

### 5. Staged rollout

`CONDURA_HONEST_REJECTION_ENABLED` (default `false`) gates the 409 path.
Cohorts: internal → 1% paid → 10% paid → 100%. Kill switch: set flag false.

### 6. Migration of existing state

A one-time scan flags `WatchlistItem` rows and `AgentTask` rows with
`is_live=true` that would hit the new path. Users see a banner and per-item
review. Orchestrations are web-only and are not scanned.

## Consequences

### Positive

- Product honesty: users never believe Arena can control their machine.
- Security boundary enforced by topology, not policy.
- Condura stays free forever (Arena assumption; see INTEGRATION.md).
- Arena remains a pure web product.

### Negative

- Handoff UX requires Condura installed for local capabilities.
- Browser-mediated streaming is more complex than a single POST.
- Spec depends on Condura implementing `arena.handoff`, event stream, and
  `arena.device.pair`.

### Neutral

- Spec lives in this repo; Condura consumes it. No monorepo merge.

## Ban list (non-negotiable)

1. No `arena.exe` / `.dmg` / `.AppImage`.
2. No cloud desktop VMs or hosted browser fleets.
3. No faking local control via iframes / WebUSB / Web Serial shims.
4. No merging `~/synaptic` and this repo.
5. No silent Condura promotion (badge only on condura/hybrid).
6. No weakening Condura's Gatekeeper from Arena.
7. No dark patterns tying Arena Pro to Condura features.
8. No web stubs that look like Condura features.
9. No hybrid capabilities carrying file attachments (web or condura only).
10. No bypassing Condura permission prompts.

## Related docs

- `docs/condura/INTEGRATION.md` — wire protocol for Condura team
- `docs/condura/CAPABILITY-REGISTRY.md` — full taxonomy
- `docs/HANDOFF.md` — state ledger

## Phases

| Phase | Scope |
|---|---|
| 0 | Spec docs (this ADR + INTEGRATION + REGISTRY + HANDOFF) |
| 1 | `capabilities.py`, 409 guards, migration, feature flag, tests |
| 2 | ConduraBadge, CTA modal, probe, handoff preview |
| 3 | Crypto, conduraClient (stream), condura routes, audit tables |
| 4 | Long-running delegate, SSE resume, reconciler |
| 5 | Product page marketing section |
| 6 | Honesty pass / regression check |
