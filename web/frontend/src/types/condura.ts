export type ExecutionEnvironment =
  | 'web'
  | 'condura'
  | 'hybrid_prep'
  | 'hybrid_delegate';

export type ConduraProbeState =
  | { kind: 'unknown' }
  | { kind: 'not_installed' }
  | { kind: 'installed_not_running' }
  | { kind: 'ready'; version?: string };

export type HandoffDispatchError =
  | 'unknown_device'
  | 'key_mismatch'
  | 'gatekeeper_denied'
  | 'permission_required'
  | 'daemon_unreachable'
  | 'daemon_timeout'
  | 'invalid_payload'
  | 'capability_not_supported'
  | 'schema_version_too_new';

export type StreamErrorKind =
  | 'stream_stalled'
  | 'stream_lost'
  | 'terminal_event_missing'
  | 'heartbeat_timeout';

export interface CapabilityInfo {
  id: string;
  description: string;
  execution: ExecutionEnvironment;
  condura_method?: string;
  stream_heartbeat_seconds?: number;
}

export interface LocalExecutionRequiredDetail {
  error: 'requires_local_execution';
  execution_environment: ExecutionEnvironment;
  message: string;
  title?: string;
  install_url: string;
  handoff_spec: string;
}

export interface HandoffPayload {
  schema: string;
  schema_min: string;
  from: {
    product: 'arena';
    instance_id: string;
    user_id_hmac: string;
    session_id: string;
  };
  intent: {
    capability: string;
    summary: string;
    args: Record<string, unknown>;
  };
  auth: {
    public_key_jwk: JsonWebKey;
    nonce: string;
    issued_at: string;
    expires_at: string;
    canonicalization: 'rfc8785';
    signature: string;
  };
  deprecation_warnings: Array<{ field: string; since: string; remove_in: string }>;
}
