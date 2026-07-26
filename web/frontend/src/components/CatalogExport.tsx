import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import { downloadCatalog, type ExportFormat } from '../lib/catalogExport';

export interface CatalogExportProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Short sub-copy describing what gets exported. */
  description?: string;
  /** Default export format. Defaults to 'markdown'. */
  defaultFormat?: ExportFormat;
}

const REVERT_AFTER_MS = 1600;

type Status = 'idle' | 'ok' | 'error';

/**
 * "Download the catalog" button — fires a browser download of the
 * 27 persona tools as Markdown (default) or JSON. Shows a transient
 * "Downloaded" / "Failed" badge for ~1.6s before reverting.
 */
export function CatalogExport({
  heading = 'Take the catalog with you',
  description = 'Download all 27 tools as Markdown or JSON — for offline reference, note-taking, or sharing with a teammate.',
  defaultFormat = 'markdown',
}: CatalogExportProps) {
  const [format, setFormat] = useState<ExportFormat>(defaultFormat);
  const [status, setStatus] = useState<Status>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onDownload = useCallback(() => {
    const ok = downloadCatalog(format);
    setStatus(ok ? 'ok' : 'error');
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus('idle'), REVERT_AFTER_MS);
  }, [format]);

  const isOk = status === 'ok';
  const isError = status === 'error';
  const ariaLabel = isOk
    ? 'Catalog downloaded'
    : isError
      ? 'Catalog download failed'
      : 'Download catalog';

  return (
    <section className="ppg-export" aria-label={heading}>
      <header className="ppg-export__head">
        <p className="ppg-export__eyebrow">
          <Download aria-hidden="true" /> {heading}
        </p>
        <p className="ppg-export__sub">{description}</p>
      </header>
      <div className="ppg-export__row">
        <fieldset className="ppg-export__format">
          <legend className="ppg-export__legend">Format</legend>
          <label className="ppg-export__radio">
            <input
              type="radio"
              name="catalog-format"
              value="markdown"
              checked={format === 'markdown'}
              onChange={() => setFormat('markdown')}
            />
            <span>Markdown</span>
          </label>
          <label className="ppg-export__radio">
            <input
              type="radio"
              name="catalog-format"
              value="json"
              checked={format === 'json'}
              onChange={() => setFormat('json')}
            />
            <span>JSON</span>
          </label>
          <label className="ppg-export__radio">
            <input
              type="radio"
              name="catalog-format"
              value="csv"
              checked={format === 'csv'}
              onChange={() => setFormat('csv')}
            />
            <span>CSV</span>
          </label>
        </fieldset>
        <button
          type="button"
          className="ppg-export__btn"
          onClick={onDownload}
          aria-live="polite"
          aria-label={ariaLabel}
        >
          <span className="ppg-export__btn-icon" aria-hidden>
            {isOk ? (
              <Check width={14} height={14} strokeWidth={2} />
            ) : isError ? (
              <X width={14} height={14} strokeWidth={2} />
            ) : (
              <Download width={14} height={14} strokeWidth={2} />
            )}
          </span>
          <span>
            {isOk
              ? 'Downloaded'
              : isError
                ? 'Failed'
                : `Download .${format === 'markdown' ? 'md' : format === 'csv' ? 'csv' : 'json'}`}
          </span>
        </button>
      </div>
    </section>
  );
}

export default CatalogExport;