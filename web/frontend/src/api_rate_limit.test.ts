import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getRateLimitDetail, streamPrompt } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('daily rate-limit contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unwraps the structured FastAPI detail envelope', () => {
    expect(
      getRateLimitDetail({
        detail: {
          error: 'rate_limit_exceeded',
          message: 'Daily message limit reached.',
          resets_at: '2026-08-25T00:00:00',
          retry_after_seconds: 42.2,
        },
      }),
    ).toEqual({
      error: 'rate_limit_exceeded',
      message: 'Daily message limit reached.',
      scope: null,
      resets_at: '2026-08-25T00:00:00',
      retry_after_seconds: 43,
    });
  });

  it('keeps token-budget refusals honest when no reset is supplied', () => {
    expect(
      getRateLimitDetail({
        detail: {
          error: 'rate_limit_exceeded',
          scope: 'tokens',
          message: 'Daily token budget reached.',
        },
      }),
    ).toMatchObject({
      error: 'rate_limit_exceeded',
      message: 'Daily token budget reached.',
      scope: 'tokens',
      resets_at: null,
      retry_after_seconds: null,
    });
  });

  it('normalizes the legacy sliding-window retry_after field', () => {
    expect(
      getRateLimitDetail({
        detail: {
          error: 'rate_limit_exceeded',
          message: 'Too many requests. Try again soon.',
          retry_after: 61,
        },
      }),
    ).toEqual({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Try again soon.',
      scope: null,
      resets_at: null,
      retry_after_seconds: 61,
    });
  });

  it('preserves reset metadata when streamPrompt rejects a 429', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: {
            error: 'rate_limit_exceeded',
            message: 'Daily message limit reached.',
            resets_at: '2026-08-25T00:00:00',
            retry_after_seconds: 120,
          },
        }),
        { status: 429, headers: { 'x-request-id': 'req-limit-1' } },
      ),
    );

    await expect(streamPrompt('hello', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      message: 'Daily message limit reached. (Request ID: req-limit-1)',
      detail: {
        detail: {
          resets_at: '2026-08-25T00:00:00',
          retry_after_seconds: 120,
        },
      },
    } satisfies Partial<ApiError>);
  });
});
