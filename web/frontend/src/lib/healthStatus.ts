/** Map backend /api/health JSON to a footer/system status chip. */

export type SystemStatus = 'checking' | 'operational' | 'degraded' | 'unreachable';

export type HealthPayload = {
  status?: string;
  database?: string;
};

/**
 * Pure interpretation of the health endpoint body.
 * Does not fetch — call sites own network I/O.
 */
export function interpretHealthPayload(data: HealthPayload | null | undefined): SystemStatus {
  if (!data || typeof data !== 'object') return 'unreachable';
  const status = String(data.status || '').toLowerCase();
  const database = String(data.database || '').toLowerCase();

  if (status === 'healthy') {
    if (database && database !== 'connected') return 'degraded';
    return 'operational';
  }
  if (status === 'degraded') return 'degraded';
  if (status) return 'degraded';
  return 'unreachable';
}
