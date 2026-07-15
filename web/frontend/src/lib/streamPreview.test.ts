import { describe, expect, it } from 'vitest';
import { extractStreamingPreview, parseStreamedAgentPreview } from '../api';

describe('parseStreamedAgentPreview', () => {
  it('extracts one_liner from complete JSON', () => {
    expect(
      parseStreamedAgentPreview(JSON.stringify({ one_liner: 'Ship it.', verdict: 'yes' })),
    ).toBe('Ship it.');
  });

  it('returns null for incomplete JSON', () => {
    expect(parseStreamedAgentPreview('{"one_liner": "Ship')).toBeNull();
  });
});

describe('extractStreamingPreview', () => {
  it('returns complete one_liner when JSON is closed', () => {
    expect(extractStreamingPreview('{"one_liner":"Live answer.","verdict":"ok"}')).toBe(
      'Live answer.',
    );
  });

  it('returns partial one_liner while JSON is still streaming', () => {
    expect(extractStreamingPreview('{"one_liner": "Partial thought about risk')).toBe(
      'Partial thought about risk',
    );
  });

  it('unescapes common JSON string escapes in partial previews', () => {
    expect(extractStreamingPreview('{"one_liner": "Line one\\nLine two')).toBe(
      'Line one\nLine two',
    );
  });

  it('returns empty when one_liner has not started inside open JSON', () => {
    expect(extractStreamingPreview('{"verdict": "still')).toBe('');
    expect(extractStreamingPreview('')).toBe('');
  });

  it('returns plain one_liner after agent_done rewrites the buffer', () => {
    expect(extractStreamingPreview('Ship the smallest honest slice first.')).toBe(
      'Ship the smallest honest slice first.',
    );
  });

  it('surfaces agent error buffers', () => {
    expect(extractStreamingPreview('[Error: model timeout]')).toBe('[Error: model timeout]');
  });
});
