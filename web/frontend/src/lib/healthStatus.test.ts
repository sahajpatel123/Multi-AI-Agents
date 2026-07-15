import { describe, expect, it } from 'vitest';
import { interpretHealthPayload } from './healthStatus';

describe('interpretHealthPayload', () => {
  it('marks healthy + connected as operational', () => {
    expect(interpretHealthPayload({ status: 'healthy', database: 'connected' })).toBe(
      'operational',
    );
  });

  it('marks healthy + disconnected as degraded', () => {
    expect(interpretHealthPayload({ status: 'healthy', database: 'disconnected' })).toBe(
      'degraded',
    );
  });

  it('marks degraded status as degraded', () => {
    expect(interpretHealthPayload({ status: 'degraded', database: 'connected' })).toBe(
      'degraded',
    );
  });

  it('marks missing payload as unreachable', () => {
    expect(interpretHealthPayload(null)).toBe('unreachable');
    expect(interpretHealthPayload(undefined)).toBe('unreachable');
  });
});
