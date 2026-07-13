# Arena × Condura Integration Spec

> **Audience:** Condura team (and Arena implementers).
> **Schema:** `arena.handoff.v1`
> **Status:** Offer — Condura may accept, modify, or reject.

---

## 1. Assumptions

| Assumption | Notes |
|---|---|
| Condura pricing is free forever with optional paid extras | Arena does not gate handoffs by Arena tier. Changes to Condura pricing are out of scope and may require re-evaluation. |
| Condura listens on `http://127.0.0.1:18600` (or Unix socket equivalent) | Browser can reach it; Arena server cannot. |
| Condura has a Gatekeeper + audit log | Arena never bypasses them. Condura's audit log is the system of record. |
| Condura JSON-RPC surface is evolving | This document is Arena's contract offer for v1. |

---

## 2. Three methods Condura must implement

### 2.1 `arena.handoff` (dispatch)

**Request (JSON-RPC 2.0):**

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "arena.handoff",
  "params": { /* HandoffPayload — see §3 */ }
}
```

**Success response (immediate — do not hold the connection for the full run):**

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "result": { "run_id": "run-uuid", "status": "accepted" }
}
```

**Error response:** see §5 (dispatch error kinds).

### 2.2 SSE stream: `GET /api/v1/runs/<run_id>/events`

- `Accept: text/event-stream`
- Each event: `id: <event-id>\ndata: <json>\n\n`
- Supports `Last-Event-ID` for resume after reconnect or tab reopen
- **Multi-consumer:** multiple SSE clients may subscribe to the same `run_id`
  (event fan-out). Each consumer independently receives events from its
  `Last-Event-ID` (or from the start if omitted).

### 2.3 `arena.device.pair` (TOFU registration)

```json
{
  "jsonrpc": "2.0",
  "id": "req-2",
  "method": "arena.device.pair",
  "params": {
    "public_key_jwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
    "product": "arena",
    "display_name": "Arena browser session"
  }
}
```

Condura MUST prompt the user ("Arena wants to talk — approve this device?").
On approval, pin the public key (replace any prior Arena pin for that product).
On re-pair after key rotation, same flow.

---

## 3. Handoff payload

```json
{
  "schema": "arena.handoff.v1",
  "schema_min": "1.0",
  "from": {
    "product": "arena",
    "instance_id": "<render-instance-uuid>",
    "user_id_hmac": "<HMAC-SHA-256(arena_secret, user_id), base64url>",
    "session_id": "<uuid>"
  },
  "intent": {
    "capability": "app.open_in_linear",
    "summary": "Create a Linear ticket from this research",
    "args": { }
  },
  "auth": {
    "public_key_jwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
    "nonce": "<16 random bytes, base64url>",
    "issued_at": "2026-07-14T12:00:00Z",
    "expires_at": "2026-07-15T12:00:00Z",
    "canonicalization": "rfc8785",
    "signature": "<ECDSA-P256 over JCS(intent+nonce+issued_at+expires_at), base64url>"
  },
  "deprecation_warnings": []
}
```

### 3.1 Canonicalization (RFC 8785 JCS)

Signature input is the UTF-8 bytes of:

```
JCS({
  "intent": intent,
  "nonce": auth.nonce,
  "issued_at": auth.issued_at,
  "expires_at": auth.expires_at
})
```

Binary fields inside `args` MUST be base64url-encoded strings before JCS.

### 3.2 Clock skew

Condura SHOULD accept `expires_at` with ±60 seconds tolerance relative to local clock.

### 3.3 Nonce store

Condura SHOULD reject replayed nonces within a 24h window.

---

## 4. Schema versioning

| Bump | Example | Condura rule |
|---|---|---|
| Major | `v1` → `v2` | MUST reject unless upgraded for v2 |
| Minor | `v1.0` → `v1.1` | MUST accept; ignore unknown fields |
| Patch | `v1.0.0` → `v1.0.1` | Spec text only; no payload change |

**Lenient reads, strict writes.** Arena never sends fields Condura's pinned
`schema_min` cannot understand. Condura logs `deprecation_warnings` if present.

| Condura | Arena sends | Result |
|---|---|---|
| v1.0 | v1.0 (`schema_min: 1.0`) | Accept |
| v1.0 | v1.1 (`schema_min: 1.0`, additive) | Accept (ignore unknown) |
| v1.0 | v2.0 | Reject `schema_version_too_new` |
| v1.1 | v1.0 | Accept (forward-compat) |

---

## 5. Error kinds

### 5.1 Dispatch errors (on `arena.handoff`)

| Kind | Meaning | Arena UI |
|---|---|---|
| `unknown_device` | Public key not pinned | Re-pair CTA |
| `key_mismatch` | Pinned key differs (TOFU rotation) | Re-pair CTA |
| `gatekeeper_denied` | Policy rejected | Show reason |
| `permission_required` | OS permission needed | Open Condura |
| `daemon_unreachable` | Connection refused | Start Condura |
| `daemon_timeout` | No response in 30s | Retry |
| `invalid_payload` | Signature / schema failed | Report bug |
| `capability_not_supported` | Unknown capability_id | Upgrade Condura |
| `schema_version_too_new` | Major version unsupported | Upgrade Condura |

### 5.2 Mid-stream failures (browser-side detection)

| Kind | Trigger | Browser action |
|---|---|---|
| `stream_stalled` | No event within capability heartbeat | Reconnect |
| `stream_lost` | Connection closed without terminal event | Reconnect; then `reconcile_needed` |
| `terminal_event_missing` | Stream closed + silence | Same as stream_lost |
| `heartbeat_timeout` | Condura reports run stalled | Reconnect |

**Reconnect:** exponential backoff 1s→60s (+20% jitter), max 5 attempts, with
`Last-Event-ID`. After max attempts, surface: "Handoff status unknown.
[Check Condura] [Cancel]."

### 5.3 Stream event kinds (Condura → browser)

| Event | Payload (minimum) |
|---|---|
| `started` | `{run_id, capability}` |
| `progress` | `{pct?, message?}` |
| `result` | `{data}` |
| `complete` | `{result}` |
| `failed` | `{error, message}` |
| `cancelled` | `{reason?}` |

---

## 6. Device pairing (TOFU)

1. First handoff from a browser session includes `public_key_jwk`.
2. Condura returns `unknown_device` if unpinned.
3. Browser calls `arena.device.pair`.
4. Condura prompts user; on approve, pins key.
5. Browser retries handoff.

**Key rotation (tab close clears sessionStorage):** new tab generates K2.
Condura returns `key_mismatch`. Browser shows "Re-pair this device" with copy:
"This is normal — Arena's session key rotated because the previous tab closed."

---

## 7. Transport summary

```
Browser                    Condura                         Arena (Render)
   |                          |                                |
   |-- arena.handoff -------->|                                |
   |<-- {run_id} -------------|                                |
   |                          |                                |
   |-- GET .../events ------->|                                |
   |<-- SSE events -----------|                                |
   |                          |                                |
   |-- POST /api/condura/.../events --------------------------->|
   |                          |                                |
```

Arena server never connects to Condura.

---

## 8. Privacy

- Handoff carries user intent and args. Condura stores them per its privacy policy.
- Arena's `user_id_hmac` is not reversible without Arena's secret.
- Arena's `HandoffRecord` is a UX mirror only; Condura's audit log is authoritative.
