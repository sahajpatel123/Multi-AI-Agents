import { useCallback, useState } from 'react';
import { submitTaskFeedback } from '../api';

type Verdict = 'accurate' | 'partial' | 'inaccurate';

const VERDICTS: Array<[Verdict, string]> = [
  ['accurate', 'Accurate'],
  ['partial', 'Partially accurate'],
  ['inaccurate', 'Inaccurate'],
];

function refusalMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : 'Could not save your accuracy verdict.';
}

/**
 * Accuracy verdict for one completed run (accurate/partial/inaccurate)
 * plus an optional note explaining it. Both travel together on every
 * POST — the backend overwrites feedback AND note on each call, so a
 * verdict change that dropped the note would silently erase what the
 * user wrote. The "Note saved" marker disappears the moment the text
 * diverges from what was actually saved.
 */
export function AgentAccuracyVerdict({ taskId }: { taskId: string }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleVerdictClick = useCallback(
    async (next: Verdict) => {
      if (!taskId || busy) return;
      const previous = verdict;
      setErr(null);
      setBusy(true);
      setVerdict(next); // optimistic; rolled back on refusal
      try {
        await submitTaskFeedback(taskId, next, note.trim() || undefined);
        setSavedNote(note.trim() || null);
      } catch (e) {
        setVerdict(previous);
        setErr(refusalMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [taskId, busy, verdict, note],
  );

  const handleSaveNote = useCallback(async () => {
    const trimmed = note.trim();
    if (!taskId || busy || !verdict || !trimmed || trimmed === savedNote) return;
    setErr(null);
    setBusy(true);
    try {
      // The current verdict rides along — saving a note must not
      // clear it, exactly as a verdict change must not clear the note.
      await submitTaskFeedback(taskId, verdict, trimmed);
      setSavedNote(trimmed);
    } catch (e) {
      setErr(refusalMessage(e));
    } finally {
      setBusy(false);
    }
  }, [taskId, busy, verdict, note, savedNote]);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: '#8C7355', marginBottom: 6 }}>
        How accurate was this answer?
      </div>
      <div
        role="group"
        aria-label="Answer accuracy"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
      >
        {VERDICTS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={verdict === value}
            disabled={busy}
            onClick={() => void handleVerdictClick(value)}
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 11,
              border: verdict === value ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
              background: verdict === value ? '#F0B84E' : 'transparent',
              color: verdict === value ? '#FAF7F2' : '#8C7355',
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'var(--vp-font-sans)',
            }}
          >
            {label}
          </button>
        ))}
        {busy ? (
          <span role="status" style={{ fontSize: 11, color: '#A0A39A' }}>
            Saving…
          </span>
        ) : null}
      </div>
      {verdict && !busy ? (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={note}
            rows={2}
            maxLength={1000}
            aria-label="Accuracy note (optional)"
            placeholder="Why? (optional)"
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 360,
              resize: 'vertical',
              border: '0.5px solid #35382F',
              borderRadius: 8,
              background: 'transparent',
              color: '#F3F0E7',
              fontSize: 12,
              fontFamily: 'var(--vp-font-sans)',
              padding: '6px 8px',
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <button
              type="button"
              aria-label="Save accuracy note"
              disabled={!note.trim() || busy || note.trim() === savedNote}
              onClick={() => void handleSaveNote()}
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                fontSize: 11,
                border: '0.5px solid #35382F',
                background: 'transparent',
                color: '#F0B84E',
                cursor: !note.trim() || busy || note.trim() === savedNote ? 'default' : 'pointer',
                fontFamily: 'var(--vp-font-sans)',
              }}
            >
              Save note
            </button>
            <span aria-live="polite" style={{ fontSize: 11, color: '#3F6B4A' }}>
              {savedNote !== null && note.trim() === savedNote ? 'Note saved' : ''}
            </span>
          </div>
        </div>
      ) : null}
      {err ? (
        <p role="alert" style={{ margin: '6px 0 0', fontSize: 11, color: '#C0392B' }}>
          {err}
        </p>
      ) : null}
    </div>
  );
}
