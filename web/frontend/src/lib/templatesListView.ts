/** Pure UI mode for Agent task templates catalog — load failure ≠ empty. */

export type TemplatesListBodyMode = 'loading' | 'load_error' | 'empty' | 'list';

export function templatesListBodyMode(opts: {
  loading: boolean;
  loadFailed: boolean;
  itemCount: number;
}): TemplatesListBodyMode {
  if (opts.loading && opts.itemCount <= 0) return 'loading';
  if (opts.loadFailed && opts.itemCount <= 0) return 'load_error';
  if (opts.itemCount <= 0) return 'empty';
  return 'list';
}
