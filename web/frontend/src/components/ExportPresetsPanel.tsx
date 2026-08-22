import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  createExportPresetFromTemplate,
  deleteExportPreset,
  listExportPresetTemplates,
  listExportPresets,
  previewExportPreset,
  renameExportPreset,
  reorderExportPresets,
  setDefaultExportPreset,
  useExportPreset,
  type ExportPreset,
  type ExportPresetPreview,
  type ExportPresetTemplate,
} from '../api';
import { downloadBlobFile } from '../lib/downloadTextFile';

/**
 * Saved-response export presets, surfaced in the sidebar's saved-takes
 * section. Lists the user's presets with one-click downloads, quick-add
 * chips from the backend's template catalog when the library is empty,
 * and per-preset deletion — every action with its own busy key and
 * honest success/failure feedback.
 */
/** Human labels for the sort orders the saved-export query supports. */
const PREVIEW_SORT_LABELS: Record<string, string> = {
  newest: 'newest first',
  oldest: 'oldest first',
  score: 'highest score first',
  pinned: 'pinned takes first',
};

function formatTimeAgo(timestamp: string): string {
  // Defensive against invalid input — `new Date('invalid')` returns
  // NaN without throwing, which would propagate and render as
  // "NaNm ago" in the UI.
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return '';
  const diffMs = Date.now() - ms;
  // Future timestamps (clock skew between client and server) show
  // as 'just now' rather than negative durations.
  if (diffMs < 0) return 'just now';
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  // A year+ old is more useful as an absolute date than a vague
  // "412d ago" — the sidebar is small and absolute dates are easier
  // to scan than huge numbers.
  if (diffDays >= 365) {
    return new Date(ms).toLocaleDateString();
  }
  return `${diffDays}d ago`;
}

export function ExportPresetsPanel() {
  const [presets, setPresets] = useState<ExportPreset[] | null>(null);
  const [templates, setTemplates] = useState<ExportPresetTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  // Dry-run previews are fetched lazily per preset and cached, so opening
  // the panel never fires one request per row and re-opening a preview
  // never refetches.
  const [previews, setPreviews] = useState<Record<number, ExportPresetPreview>>({});
  const [openPreviews, setOpenPreviews] = useState<Record<number, boolean>>({});
  // Inline rename: which preset's name is being edited and its draft value.
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([listExportPresets(), listExportPresetTemplates()])
      .then(([presetList, templateList]) => {
        if (cancelled) return;
        setPresets(presetList);
        setTemplates(templateList);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPresets(null);
        setLoadError(
          error instanceof ApiError
            ? error.message
            : 'Could not load export presets — try again.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<string>) => {
      setBusyKey(key);
      setActionError(null);
      setStatus(null);
      try {
        const message = await action();
        setStatus(message);
      } catch (error) {
        setActionError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error && error.message
              ? error.message
              : 'Something went wrong — try again.',
        );
      } finally {
        setBusyKey(null);
      }
    },
    [],
  );

  const handleUse = useCallback(
    (preset: ExportPreset) =>
      runAction(`use-${preset.id}`, async () => {
        const { blob, filename } = await useExportPreset(preset.id, preset.format);
        if (!downloadBlobFile(blob, filename)) {
          throw new Error(`Could not download "${preset.name}" — try again.`);
        }
        return `Downloaded "${preset.name}".`;
      }),
    [runAction],
  );

  const handleDelete = useCallback(
    (preset: ExportPreset) =>
      runAction(`delete-${preset.id}`, async () => {
        await deleteExportPreset(preset.id);
        setPresets((current) =>
          current ? current.filter((item) => item.id !== preset.id) : current,
        );
        return `Deleted "${preset.name}".`;
      }),
    [runAction],
  );

  const handleAddFromTemplate = useCallback(
    (template: ExportPresetTemplate) =>
      runAction(`add-${template.id}`, async () => {
        const preset = await createExportPresetFromTemplate(template.id);
        setPresets((current) => (current ? [...current, preset] : [preset]));
        return `Added "${preset.name}" from the template.`;
      }),
    [runAction],
  );

  const handleTogglePreview = useCallback(
    async (preset: ExportPreset) => {      const isOpen = openPreviews[preset.id] === true;
      setOpenPreviews((current) => ({ ...current, [preset.id]: !isOpen }));
      if (isOpen || previews[preset.id]) return;
      const key = `preview-${preset.id}`;
      setBusyKey(key);
      setActionError(null);
      try {
        const preview = await previewExportPreset(preset.id);
        setPreviews((current) => ({ ...current, [preset.id]: preview }));
      } catch (error) {
        // Collapse on failure so a stale spinner never lingers and the
        // alert is the only visible signal.
        setOpenPreviews((current) => ({ ...current, [preset.id]: false }));
        setActionError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error && error.message
              ? error.message
              : 'Something went wrong — try again.',
        );
      } finally {
        setBusyKey(null);
      }
    },
    [openPreviews, previews],
  );

  const handleRenameSave = useCallback(
    (preset: ExportPreset) =>
      runAction(`rename-${preset.id}`, async () => {
        const updated = await renameExportPreset(preset.id, renameValue);
        setPresets((current) =>
          current
            ? current.map((item) => (item.id === preset.id ? updated : item))
            : current,
        );
        setRenamingId(null);
        return `Renamed to "${updated.name}".`;
      }),
    [renameValue, runAction],
  );

  const handleMakeDefault = useCallback(
    (preset: ExportPreset) =>
      runAction(`default-${preset.id}`, async () => {
        // The backend clears every other default in the same transaction;
        // mirror that locally so the badges stay consistent without a refetch.
        await setDefaultExportPreset(preset.id);
        setPresets((current) =>
          current
            ? current.map((item) => ({
                ...item,
                is_default: item.id === preset.id,
              }))
            : current,
        );
        return `"${preset.name}" is now the default export preset.`;
      }),
    [runAction],
  );

  const handleMove = useCallback(
    (preset: ExportPreset, direction: -1 | 1) =>
      runAction(`move-${preset.id}`, async () => {
        const current = presets ?? [];
        const index = current.findIndex((item) => item.id === preset.id);
        const targetIndex = index + direction;
        if (index < 0 || targetIndex < 0 || targetIndex >= current.length) {
          return `"${preset.name}" is already at the ${direction === -1 ? 'top' : 'bottom'}.`;
        }
        // State only changes after the server accepts the new order, so a
        // failed request leaves the list exactly as it was.
        const next = [...current];
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        await reorderExportPresets(next.map((item) => item.id));
        setPresets(next.map((item, position) => ({ ...item, position })));
        return `Moved "${preset.name}" ${direction === -1 ? 'up' : 'down'}.`;
      }),
    [presets, runAction],
  );

  if (presets === null) {
    return (
      <div style={{ padding: '10px 0' }}>
        {loadError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span role="alert" style={{ color: '#D85A30', fontSize: 11 }}>
              {loadError}
            </span>
            <button
              type="button"
              onClick={() => setReloadTick((value) => value + 1)}
              style={{
                background: 'none',
                border: '0.5px solid #E0D8D0',
                borderRadius: 6,
                color: '#F0B84E',
                cursor: 'pointer',
                padding: '3px 8px',
                fontSize: 10,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontFamily: 'var(--vp-font-sans)',
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <span role="status" style={{ color: '#A0A39A', fontSize: 11 }}>
            Loading export presets…
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0' }} data-testid="export-presets-panel">
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#A0A39A',
          margin: '0 0 6px',
          fontFamily: 'var(--vp-font-sans)',
        }}
      >
        Export presets
      </div>

      {presets.length === 0 ? (
        <p style={{ fontSize: 11, color: '#A0A39A', margin: '0 0 8px' }}>
          No presets yet — add one from a template to reuse a saved-takes export.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'grid', gap: 6 }}>
          {presets.map((preset, index) => {
            const busy = busyKey === `use-${preset.id}`;
            const deleting = busyKey === `delete-${preset.id}`;
            const filters = [
              preset.search ? `“${preset.search}”` : null,
              preset.min_score !== null ? `score ≥ ${preset.min_score}` : null,
              preset.max_score !== null ? `score ≤ ${preset.max_score}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            // The backend stamps last_used_at on every download; an empty
            // format (unparseable timestamp) means no stamp at all rather
            // than a dangling "used".
            const formattedAgo = preset.last_used_at
              ? formatTimeAgo(preset.last_used_at)
              : null;
            const usedLabel = formattedAgo ? `used ${formattedAgo}` : null;
            return (
              <li
                key={preset.id}
                style={{
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 6,
                  padding: '6px 8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                  {renamingId === preset.id ? (
                    <input
                      type="text"
                      value={renameValue}
                      autoFocus
                      maxLength={100}
                      aria-label={`Rename export preset ${preset.name}`}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setRenamingId(null);
                        } else if (event.key === 'Enter' && renameValue.trim()) {
                          void handleRenameSave(preset);
                        }
                      }}
                      style={{
                        width: '100%',
                        fontSize: 12,
                        color: '#4A3728',
                        background: '#FAF7F4',
                        border: '0.5px solid #E0D8D0',
                        borderRadius: 5,
                        padding: '2px 6px',
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                    />
                  ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#4A3728',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {preset.name}
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: '#A0A39A',
                      }}
                    >
                      {preset.format}
                    </span>
                    {preset.is_default ? (
                      <span
                        title="This preset is your default export"
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          color: '#5A8C6A',
                          border: '0.5px solid #5A8C6A',
                          borderRadius: 4,
                          padding: '0 4px',
                        }}
                      >
                        Default
                      </span>
                    ) : null}
                  </div>
                  )}
                  {(filters || usedLabel) && renamingId !== preset.id ? (
                    <div style={{ fontSize: 10, color: '#A0A39A' }}>
                      {filters}
                      {filters && usedLabel ? ' · ' : null}
                      {usedLabel}
                    </div>
                  ) : null}
                  {renamingId === preset.id ? (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button
                        type="button"
                        disabled={busyKey !== null || !renameValue.trim()}
                        aria-busy={busyKey === `rename-${preset.id}`}
                        aria-label={`Save name for export preset ${preset.name}`}
                        onClick={() => void handleRenameSave(preset)}
                        style={{
                          background: 'none',
                          border: '0.5px solid #E0D8D0',
                          borderRadius: 6,
                          color: '#5A8C6A',
                          cursor: busyKey !== null ? 'wait' : 'pointer',
                          padding: '2px 7px',
                          fontSize: 10,
                          fontFamily: 'var(--vp-font-sans)',
                        }}
                      >
                        {busyKey === `rename-${preset.id}` ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        aria-label={`Cancel renaming export preset ${preset.name}`}
                        onClick={() => setRenamingId(null)}
                        style={{
                          background: 'none',
                          border: '0.5px solid #E0D8D0',
                          borderRadius: 6,
                          color: '#A0A39A',
                          cursor: busyKey !== null ? 'wait' : 'pointer',
                          padding: '2px 7px',
                          fontSize: 10,
                          fontFamily: 'var(--vp-font-sans)',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {renamingId !== preset.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busyKey !== null || index === 0}
                        aria-busy={busyKey === `move-${preset.id}`}
                        aria-label={`Move export preset ${preset.name} up`}
                        onClick={() => void handleMove(preset, -1)}
                        style={{
                          background: 'none',
                          border: '0.5px solid #E0D8D0',
                          borderRadius: 6,
                          color: index === 0 ? '#E0D8D0' : '#4A3728',
                          cursor: busyKey !== null ? 'wait' : 'pointer',
                          padding: '3px 7px',
                          fontSize: 10,
                          fontFamily: 'var(--vp-font-sans)',
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={busyKey !== null || index === presets.length - 1}
                        aria-busy={busyKey === `move-${preset.id}`}
                        aria-label={`Move export preset ${preset.name} down`}
                        onClick={() => void handleMove(preset, 1)}
                        style={{
                          background: 'none',
                          border: '0.5px solid #E0D8D0',
                          borderRadius: 6,
                          color: index === presets.length - 1 ? '#E0D8D0' : '#4A3728',
                          cursor: busyKey !== null ? 'wait' : 'pointer',
                          padding: '3px 7px',
                          fontSize: 10,
                          fontFamily: 'var(--vp-font-sans)',
                        }}
                      >
                        ↓
                      </button>
                    </>
                  ) : null}
                  {renamingId !== preset.id ? (
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    aria-busy={false}
                    aria-label={`Rename export preset ${preset.name}`}
                    onClick={() => {
                      setRenamingId(preset.id);
                      setRenameValue(preset.name);
                    }}
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 6,
                      color: '#4A3728',
                      cursor: busyKey !== null ? 'wait' : 'pointer',
                      padding: '3px 8px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    Rename
                  </button>
                  ) : null}
                  {!preset.is_default && renamingId !== preset.id ? (
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      aria-busy={busyKey === `default-${preset.id}`}
                      aria-label={`Make ${preset.name} the default export preset`}
                      onClick={() => void handleMakeDefault(preset)}
                      style={{
                        background: 'none',
                        border: '0.5px solid #E0D8D0',
                        borderRadius: 6,
                        color:
                          busyKey === `default-${preset.id}` ? '#A0A39A' : '#5A8C6A',
                        cursor: busyKey !== null ? 'wait' : 'pointer',
                        padding: '3px 8px',
                        fontSize: 10,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                    >
                      {busyKey === `default-${preset.id}` ? 'Setting…' : 'Make default'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    aria-busy={busyKey === `preview-${preset.id}`}
                    aria-expanded={
                      openPreviews[preset.id] === true && Boolean(previews[preset.id])
                    }
                    aria-label={`Preview export preset ${preset.name}`}
                    onClick={() => void handleTogglePreview(preset)}
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 6,
                      color: busyKey === `preview-${preset.id}` ? '#A0A39A' : '#4A3728',
                      cursor: busyKey !== null ? 'wait' : 'pointer',
                      padding: '3px 8px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    {busyKey === `preview-${preset.id}`
                      ? 'Counting…'
                      : openPreviews[preset.id] && previews[preset.id]
                        ? 'Hide count'
                        : 'Preview'}
                  </button>
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    aria-busy={busy}
                    aria-label={`Download export preset ${preset.name}`}
                    onClick={() => void handleUse(preset)}
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 6,
                      color: busy ? '#A0A39A' : '#F0B84E',
                      cursor: busyKey !== null ? 'wait' : 'pointer',
                      padding: '3px 8px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    {busy ? 'Downloading…' : 'Download'}
                  </button>
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    aria-busy={deleting}
                    aria-label={`Delete export preset ${preset.name}`}
                    onClick={() => void handleDelete(preset)}
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 6,
                      color: deleting ? '#A0A39A' : '#D85A30',
                      cursor: busyKey !== null ? 'wait' : 'pointer',
                      padding: '3px 8px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
              {openPreviews[preset.id] && previews[preset.id] ? (
                <div
                  style={{
                    borderTop: '0.5px solid #E0D8D0',
                    padding: '6px 8px 2px',
                    fontSize: 11,
                    color: '#A0A39A',
                  }}
                >
                  <strong style={{ color: '#4A3728', fontWeight: 600 }}>
                    {previews[preset.id].matchCount}
                  </strong>{' '}
                  {previews[preset.id].matchCount === 1 ? 'take matches' : 'takes match'}
                  {(() => {
                    const preview = previews[preset.id];
                    const descriptors = [
                      preview.sort ? PREVIEW_SORT_LABELS[preview.sort] || preview.sort : null,
                      preview.search ? `matching “${preview.search}”` : null,
                    ].filter(Boolean);
                    return descriptors.length > 0 ? (
                      <span> · {descriptors.join(' · ')}</span>
                    ) : null;
                  })()}
                  {previews[preset.id].sample.length > 0 ? (
                    <ul
                      style={{
                        listStyle: 'none',
                        margin: '4px 0 0',
                        padding: 0,
                        display: 'grid',
                        gap: 2,
                      }}
                    >
                      {previews[preset.id].sample.slice(0, 3).map((row) => (
                        <li key={row.id}>
                          {row.persona_name ? `${row.persona_name}: ` : ''}
                          {row.one_liner}
                          {row.score !== null ? ` (${row.score})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {previews[preset.id].truncated &&
                  previews[preset.id].sample.length > 0 ? (
                    <div style={{ marginTop: 2 }}>
                      +{previews[preset.id].matchCount - previews[preset.id].sample.length} more in
                      the full export
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
            );
          })}
        </ul>
      )}

      {presets.length === 0 && templates.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 8px' }}>
          {templates.slice(0, 4).map((template) => {
            const adding = busyKey === `add-${template.id}`;
            return (
              <button
                key={template.id}
                type="button"
                disabled={busyKey !== null}
                aria-busy={adding}
                title={template.description}
                aria-label={`Add export preset from template ${template.name}`}
                onClick={() => void handleAddFromTemplate(template)}
                style={{
                  background: 'none',
                  border: '0.5px dashed #E0D8D0',
                  borderRadius: 6,
                  color: adding ? '#A0A39A' : '#4A3728',
                  cursor: busyKey !== null ? 'wait' : 'pointer',
                  padding: '3px 8px',
                  fontSize: 10,
                  fontFamily: 'var(--vp-font-sans)',
                }}
              >
                {adding ? 'Adding…' : `+ ${template.name}`}
              </button>
            );
          })}
        </div>
      ) : null}

      {status ? (
        <p role="status" style={{ fontSize: 11, color: '#5A8C6A', margin: '4px 0 0' }}>
          {status}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" style={{ fontSize: 11, color: '#D85A30', margin: '4px 0 0' }}>
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

export default ExportPresetsPanel;
