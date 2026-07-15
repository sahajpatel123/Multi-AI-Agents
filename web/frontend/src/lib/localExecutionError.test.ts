import { describe, expect, it } from 'vitest';
import { LocalExecutionRequiredError } from '../api';

/**
 * Drive the same shape AgentPage handles for HTTP 409 honesty.
 * LocalExecutionRequiredError is constructed from asLocalExecutionDetail
 * output; here we assert the public constructor + fields used by the UI.
 */
describe('LocalExecutionRequiredError', () => {
  it('carries requires_local_execution fields for Condura CTA', () => {
    const err = new LocalExecutionRequiredError({
      error: 'requires_local_execution',
      execution_environment: 'condura',
      message: 'This task needs your machine. Powered by Condura.',
      title: 'This needs your machine',
      install_url: 'https://condura.app',
      handoff_spec: 'arena.handoff.v1',
    });
    expect(err.status).toBe(409);
    expect(err.detail.error).toBe('requires_local_execution');
    expect(err.detail.install_url).toContain('condura.app');
    expect(err.detail.handoff_spec).toBe('arena.handoff.v1');
    expect(err.message).toMatch(/machine|Condura/i);
  });
});
