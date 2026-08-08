import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MoodMatcherHistory } from './MoodMatcherHistory';
import {
  readMoodHistory,
  recordMoodPick,
  clearMoodHistory,
} from '../lib/moodHistory';

function writeMoodHistory(values: Array<{ id: string; at: number }>) {
  window.localStorage.setItem(
    'arena:persona-playground:mood-history:v1',
    JSON.stringify(values),
  );
}

describe('moodHistory (pure helpers)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty list for missing storage', () => {
    expect(readMoodHistory(null)).toEqual([]);
  });

  it('filters out unknown ids', () => {
    writeMoodHistory([
      { id: 'stuck', at: 1 },
      { id: 'not-a-mood', at: 2 },
      { id: 'curious', at: 3 },
    ]);
    const out = readMoodHistory(window.localStorage);
    expect(out.map((e) => e.id)).toEqual(['stuck', 'curious']);
  });

  it('dedupes by id keeping the latest', () => {
    writeMoodHistory([
      { id: 'stuck', at: 1 },
      { id: 'stuck', at: 2 },
      { id: 'curious', at: 3 },
    ]);
    const out = readMoodHistory(window.localStorage);
    expect(out.length).toBe(2);
  });

  it('recordMoodPick bumps the entry to the front', () => {
    writeMoodHistory([
      { id: 'stuck', at: 1 },
      { id: 'curious', at: 2 },
    ]);
    recordMoodPick(window.localStorage, 'stuck', 99);
    const out = readMoodHistory(window.localStorage);
    expect(out[0].id).toBe('stuck');
    expect(out[0].at).toBe(99);
  });

  it('caps history at the limit', () => {
    for (let i = 0; i < 8; i += 1) {
      const ids: Array<'stuck' | 'curious' | 'verdict' | 'inspired' | 'exploring'> = [
        'stuck',
        'curious',
        'verdict',
        'inspired',
        'exploring',
      ];
      recordMoodPick(window.localStorage, ids[i % ids.length], i);
    }
    expect(readMoodHistory(window.localStorage).length).toBeLessThanOrEqual(5);
  });

  it('clearMoodHistory wipes the key', () => {
    writeMoodHistory([{ id: 'stuck', at: 1 }]);
    clearMoodHistory(window.localStorage);
    expect(readMoodHistory(window.localStorage)).toEqual([]);
  });
});

describe('MoodMatcherHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders nothing on a cold start', () => {
    const { container } = render(
      <MemoryRouter>
        <MoodMatcherHistory />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per stored mood', () => {
    writeMoodHistory([
      { id: 'stuck', at: Date.now() },
      { id: 'curious', at: Date.now() },
    ]);
    render(
      <MemoryRouter>
        <MoodMatcherHistory />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('button', { name: /Replay .* mood/i }).length).toBe(2);
  });

  it('fires onReplay with the mood id when a chip is clicked', () => {
    writeMoodHistory([{ id: 'verdict', at: Date.now() }]);
    const onReplay = vi.fn();
    render(
      <MemoryRouter>
        <MoodMatcherHistory onReplay={onReplay} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Replay Need a verdict mood/i }));
    expect(onReplay).toHaveBeenCalledWith('verdict');
  });

  it('clear button empties the widget', () => {
    writeMoodHistory([
      { id: 'stuck', at: Date.now() },
      { id: 'curious', at: Date.now() },
    ]);
    const { container } = render(
      <MemoryRouter>
        <MoodMatcherHistory />
      </MemoryRouter>,
    );
    expect(container.firstChild).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Clear mood history/i }));
    expect(container.firstChild).toBeNull();
  });

  it('refreshes when recordMoodPick fires in the same tab', async () => {
    // First render: empty, returns null.
    const { container } = render(
      <MemoryRouter>
        <MoodMatcherHistory />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
    // Same-tab write — the browser's storage event only fires in
    // OTHER tabs, so the lib must self-notify to refresh this tab.
    recordMoodPick(window.localStorage, 'stuck', 1);
    await waitFor(() => {
      expect(container.firstChild).not.toBeNull();
    });
    expect(
      screen.getByRole('button', { name: /Replay I.m stuck mood/i }),
    ).toBeInTheDocument();
  });

  it('clearMoodHistory notifies same-tab listeners', async () => {
    writeMoodHistory([{ id: 'stuck', at: 1 }]);
    const { container } = render(
      <MemoryRouter>
        <MoodMatcherHistory />
      </MemoryRouter>,
    );
    expect(container.firstChild).not.toBeNull();
    clearMoodHistory(window.localStorage);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});