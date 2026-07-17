# Condura integration telemetry

## Opt-in

Anonymous counters only. Default off until product wires a
`share_anonymous_usage` preference (future). Server counters in
`arena/core/telemetry.py` are process-local and do not leave the host
unless exported by metrics endpoints.

## Probe privacy

The browser probe only ever touches `127.0.0.1` on the user's own machine
(browser security model enforces this). Arena receives only the categorical
state (`not_installed` | `installed_not_running` | `ready`) and, when ready,
the Condura version string. **No ports, paths, process names, system info, or
other probe results are collected.** Probe results are sent as a one-way
anonymous event with no reverse-lookup to the user.

## Counters (names)

- `capability_guard_decisions_total{capability_id,decision}`
- `handoffs_dispatched_total{capability_id}`
- `pairing_mismatch_total`
- `migration_flags_total`
- `condura_probe_state_total{kind}`

Retention target: 90 days when exported.
