import { describe, expect, it } from 'vitest';
import {
  createPromptHistoryState,
  NO_HISTORY_ENTRY,
  shouldCapturePromptHistoryKey,
  stepPromptHistory,
} from './promptHistory';

const HISTORY = ['newest prompt', 'middle prompt', 'oldest prompt'];

describe('stepPromptHistory', () => {
  it('ArrowUp from the draft fills the most recent prompt and keeps the draft', () => {
    const state = createPromptHistoryState();
    const result = stepPromptHistory('up', state, 'draft in progress', HISTORY);
    expect(result.changed).toBe(true);
    expect(result.value).toBe('newest prompt');
    expect(result.state).toEqual({ index: 0, draft: 'draft in progress' });
  });

  it('ArrowUp again walks to older prompts', () => {
    const state = { index: 0, draft: 'draft in progress' };
    const result = stepPromptHistory('up', state, 'newest prompt', HISTORY);
    expect(result.value).toBe('middle prompt');
    expect(result.state).toEqual({ index: 1, draft: 'draft in progress' });
  });

  it('ArrowUp at the oldest prompt is a no-op', () => {
    const state = { index: HISTORY.length - 1, draft: 'draft in progress' };
    const result = stepPromptHistory('up', state, 'oldest prompt', HISTORY);
    expect(result.changed).toBe(false);
    expect(result.value).toBe('oldest prompt');
    expect(result.state).toBe(state);
  });

  it('ArrowDown walks back toward the newest prompt', () => {
    const state = { index: 1, draft: 'draft in progress' };
    const result = stepPromptHistory('down', state, 'middle prompt', HISTORY);
    expect(result.value).toBe('newest prompt');
    expect(result.state).toEqual({ index: 0, draft: 'draft in progress' });
  });

  it('ArrowDown at the newest prompt restores the original draft', () => {
    const state = { index: 0, draft: 'draft in progress' };
    const result = stepPromptHistory('down', state, 'newest prompt', HISTORY);
    expect(result.value).toBe('draft in progress');
    expect(result.state).toEqual(createPromptHistoryState());
  });

  it('ArrowDown from the draft is a no-op', () => {
    const state = createPromptHistoryState();
    const result = stepPromptHistory('down', state, 'typing', HISTORY);
    expect(result.changed).toBe(false);
    expect(result.value).toBe('typing');
  });

  it('ArrowUp with an empty history is a no-op', () => {
    const state = createPromptHistoryState();
    const result = stepPromptHistory('up', state, 'typing', []);
    expect(result.changed).toBe(false);
    expect(result.value).toBe('typing');
  });
});

describe('shouldCapturePromptHistoryKey', () => {
  it('accepts bare ArrowUp and ArrowDown', () => {
    expect(shouldCapturePromptHistoryKey({ key: 'ArrowUp' })).toBe(true);
    expect(shouldCapturePromptHistoryKey({ key: 'ArrowDown' })).toBe(true);
  });

  it('rejects other keys', () => {
    expect(shouldCapturePromptHistoryKey({ key: 'Enter' })).toBe(false);
    expect(shouldCapturePromptHistoryKey({ key: 'ArrowLeft' })).toBe(false);
  });

  it('rejects modifier-key combinations', () => {
    expect(shouldCapturePromptHistoryKey({ key: 'ArrowUp', metaKey: true })).toBe(false);
    expect(shouldCapturePromptHistoryKey({ key: 'ArrowUp', ctrlKey: true })).toBe(false);
    expect(shouldCapturePromptHistoryKey({ key: 'ArrowDown', altKey: true })).toBe(false);
    expect(shouldCapturePromptHistoryKey({ key: 'ArrowUp', shiftKey: true })).toBe(false);
  });

  it('rejects keys while an IME composition is active', () => {
    expect(shouldCapturePromptHistoryKey({ key: 'ArrowUp', isComposing: true })).toBe(false);
  });
});
