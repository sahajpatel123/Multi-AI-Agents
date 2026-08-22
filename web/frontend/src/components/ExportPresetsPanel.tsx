import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  createExportPresetFromTemplate,
  deleteExportPreset,
  listExportPresetTemplates,
  listExportPresets,
  useExportPreset,
  type ExportPreset,
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
export function ExportPresetsPanel() {
  const [presets, setPresets] = useState<ExportPreset[] | null>(null);
  const [templates, setTemplates] = useState<ExportPresetTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

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
          {presets.map((preset) => {
            const busy = busyKey === `use-${preset.id}`;
            const deleting = busyKey === `delete-${preset.id}`;
            const filters = [
              preset.search ? `“${preset.search}”` : null,
              preset.min_score !== null ? `score ≥ ${preset.min_score}` : null,
              preset.max_score !== null ? `score ≤ ${preset.max_score}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={preset.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 6,
                  padding: '6px 8px',
                }}
              >
                <div style={{ minWidth: 0 }}>
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
                  </div>
                  {filters ? (
                    <div style={{ fontSize: 10, color: '#A0A39A' }}>{filters}</div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
