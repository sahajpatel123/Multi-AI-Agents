import { describe, expect, it } from 'vitest';
import { withRequestId } from './api';

describe('withRequestId', () => {
  it('appends the X-Request-ID header to the message', () => {
    const response = new Response(null, { headers: { 'X-Request-ID': 'trace-123' } });
    expect(withRequestId('Failed', response)).toBe('Failed (Request ID: trace-123)');
  });

  it('leaves the message unchanged when no request ID header is present', () => {
    const response = new Response(null);
    expect(withRequestId('Failed', response)).toBe('Failed');
  });
});
