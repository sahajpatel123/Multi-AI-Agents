import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccountSecurity } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('getAccountSecurity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the security endpoint and normalizes every field', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          email: 'dev@example.com',
          member_since: '2026-01-15T09:30:00Z',
          last_active_at: null,
          tier: 'PRO',
          is_verified: true,
          has_password: true,
          password_last_changed_at: null,
        }),
        { status: 200 },
      ),
    );

    const details = await getAccountSecurity();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/auth/security', {});
    expect(details).toEqual({
      email: 'dev@example.com',
      memberSince: '2026-01-15T09:30:00Z',
      lastActiveAt: null,
      tier: 'PRO',
      isVerified: true,
      hasPassword: true,
      passwordLastChangedAt: null,
    });
  });

  it('coerces a malformed payload into safe defaults instead of crashing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ email: 42, is_verified: 'yes' }), { status: 200 }),
    );

    const details = await getAccountSecurity();

    expect(details).toEqual({
      email: '',
      memberSince: null,
      lastActiveAt: null,
      tier: '',
      isVerified: false,
      hasPassword: false,
      passwordLastChangedAt: null,
    });
  });

  it('surfaces the rate-limit refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many security panel reads. Please slow down.' } }),
        { status: 429, headers: { 'X-Request-ID': 'req-sec-1' } },
      ),
    );

    await expect(getAccountSecurity()).rejects.toThrow(
      'Too many security panel reads. Please slow down. (Request ID: req-sec-1)',
    );
  });
});
