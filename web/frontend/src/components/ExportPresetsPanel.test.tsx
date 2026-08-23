import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { ExportPresetsPanel } from './ExportPresetsPanel';
import * as apiModule from '../api';
import * as downloadModule from '../lib/downloadTextFile';

vi.mock('../api', () => ({
  // Mirrors the real ApiError shape (message, status, detail) so tests
  // can attach structured backend details like default_preset_protected.
  ApiError: class ApiError extends Error {
    status: number;
    detail: unknown;
    constructor(message: string, status: number, detail?: unknown) {
      super(message);
      this.status = status;
      this.detail = detail;
    }
  },
  listExportPresets: vi.fn(),
  listExportPresetTemplates: vi.fn(),
  createExportPresetFromTemplate: vi.fn(),
  bulkDeleteExportPresets: vi.fn(),
  deleteExportPreset: vi.fn(),
  useExportPreset: vi.fn(),
  previewExportPreset: vi.fn(),
  renameExportPreset: vi.fn(),
  reorderExportPresets: vi.fn(),
  setDefaultExportPreset: vi.fn(),
  exportPresetsBackup: vi.fn(),
  importPresetsBackup: vi.fn(),
}));

vi.mock('../lib/downloadTextFile', () => ({
  downloadBlobFile: vi.fn(),
  downloadJsonFile: vi.fn(),
}));

const hoisted = vi.hoisted(() => {
  const presetCsv = {
    id: 3,
    name: 'High Score Responses',
    description: 'Export responses with score >= 80',
    preset_type: 'saved',
    format: 'csv',
    search: null,
    persona_id: null,
    min_score: 80,
    max_score: null,
    sort: 'score',
    position: 0,
    is_default: false,
    last_used_at: null,
    created_at: '2026-08-20T10:00:00',
    updated_at: '2026-08-20T10:00:00',
  };
  const templateHighScore = {
    id: 'high_score',
    name: 'High Score Responses',
    description: 'Export responses with score >= 80',
    preset_type: 'saved',
    format: 'csv',
    search: null,
    persona_id: null,
    min_score: 80,
    max_score: null,
    sort: 'score',
  };
  return { presetCsv, templateHighScore };
});

const mockedApi = vi.mocked(apiModule);

describe('ExportPresetsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.listExportPresets.mockResolvedValue([hoisted.presetCsv]);
    mockedApi.listExportPresetTemplates.mockResolvedValue([hoisted.templateHighScore]);
    vi.mocked(downloadModule.downloadBlobFile).mockReturnValue(true);
  });

  it('renders the loaded presets with their format and filters', async () => {
    render(<ExportPresetsPanel />);

    expect(await screen.findByText('Export presets')).toBeInTheDocument();
    expect(screen.getByText('High Score Responses')).toBeInTheDocument();
    expect(screen.getByText('score ≥ 80')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download export preset high score responses/i })).toBeInTheDocument();
  });

  it('shows an honest load failure with a retry that reloads', async () => {
    mockedApi.listExportPresets.mockRejectedValueOnce(new Error('nope'));
    render(<ExportPresetsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load export presets — try again.',
    );

    mockedApi.listExportPresets.mockResolvedValueOnce([hoisted.presetCsv]);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('High Score Responses')).toBeInTheDocument();
  });

  it('downloads a preset through the redirecting use endpoint', async () => {
    mockedApi.useExportPreset.mockResolvedValue({
      blob: new Blob(['id,prompt'], { type: 'text/csv' }),
      filename: 'arena-saved-export.csv',
    });
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /download export preset high score responses/i }),
    );

    await waitFor(() => {
      expect(mockedApi.useExportPreset).toHaveBeenCalledWith(3, 'csv');
      expect(downloadModule.downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-saved-export.csv',
      );
      expect(screen.getByRole('status')).toHaveTextContent('Downloaded "High Score Responses".');
    });
  });

  it('surfaces a failed preset download without losing the row', async () => {
    mockedApi.useExportPreset.mockRejectedValue(
      new apiModule.ApiError('Too many export preset uses.', 429),
    );
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /download export preset high score responses/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many export preset uses.');
    expect(screen.getByText('High Score Responses')).toBeInTheDocument();
  });

  it('marks a download busy only while it is in flight', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<{ blob: Blob; filename: string }>((resolve) => {
      release = () => resolve({ blob: new Blob(['x']), filename: 'f.csv' });
    });
    mockedApi.useExportPreset.mockReturnValueOnce(pending);
    render(<ExportPresetsPanel />);

    const button = await screen.findByRole('button', {
      name: /download export preset high score responses/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveTextContent('Downloading…');
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    await act(async () => {
      release?.();
    });
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-busy', 'false');
      expect(button).toHaveTextContent('Download');
    });
  });

  it('deletes a preset and removes its row', async () => {
    mockedApi.deleteExportPreset.mockResolvedValue(undefined);
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /delete export preset high score responses/i }),
    );

    await waitFor(() => {
      expect(mockedApi.deleteExportPreset).toHaveBeenCalledWith(3);
      expect(screen.queryByText('High Score Responses')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Deleted "High Score Responses".');
    });
  });

  it('offers template quick-adds when the library is empty and adds one', async () => {
    mockedApi.listExportPresets.mockResolvedValue([]);
    mockedApi.createExportPresetFromTemplate.mockResolvedValue(hoisted.presetCsv);
    render(<ExportPresetsPanel />);

    expect(await screen.findByText(/no presets yet/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /add export preset from template high score responses/i }),
    );

    await waitFor(() => {
      expect(mockedApi.createExportPresetFromTemplate).toHaveBeenCalledWith('high_score');
      expect(screen.getByText('High Score Responses')).toBeInTheDocument();
    });
  });

  it('previews a preset lazily and shows the match count with samples', async () => {
    mockedApi.previewExportPreset.mockResolvedValue({
      matchCount: 12,
      truncated: true,
      sort: 'score',
      search: null,
      sample: [
        { id: 7, persona_name: 'The Analyst', score: 92, one_liner: 'Anchor the claim.', saved_at: null },
        { id: 8, persona_name: null, score: null, one_liner: 'Second take.', saved_at: null },
      ],
    });
    render(<ExportPresetsPanel />);

    const button = await screen.findByRole('button', {
      name: /preview export preset high score responses/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedApi.previewExportPreset).toHaveBeenCalledWith(3);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button).toHaveTextContent('Hide count');
    });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/takes match/)).toBeInTheDocument();
    // The effective sort the dry run applied is described in place.
    expect(screen.getByText(/highest score first/)).toBeInTheDocument();
    expect(screen.getByText('The Analyst: Anchor the claim. (92)')).toBeInTheDocument();
    expect(screen.getByText('Second take.')).toBeInTheDocument();
    expect(
      screen.getByText(/\+10 more in the full export/),
    ).toBeInTheDocument();
  });

  it('describes an effective search term alongside the sort order', async () => {
    mockedApi.previewExportPreset.mockResolvedValue({
      matchCount: 4,
      truncated: false,
      sort: 'newest',
      search: 'Bitcoin',
      sample: [],
    });
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: /preview export preset high score responses/i,
      }),
    );

    await waitFor(() => {
      expect(mockedApi.previewExportPreset).toHaveBeenCalled();
    });
    // The count, effective sort, and search term render as adjacent
    // segments inside one line.
    const line = screen.getByText(/takes match/);
    expect(line).toHaveTextContent('newest first');
    expect(line).toHaveTextContent('matching “Bitcoin”');
  });

  it('caches a preview so hiding and re-showing does not refetch', async () => {
    mockedApi.previewExportPreset.mockResolvedValue({
      matchCount: 2,
      truncated: false,
      sample: [],
    });
    render(<ExportPresetsPanel />);

    const button = await screen.findByRole('button', {
      name: /preview export preset high score responses/i,
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveTextContent('Hide count');
    });

    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: /preview export preset high score responses/i }))
      .toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });
    expect(mockedApi.previewExportPreset).toHaveBeenCalledTimes(1);
  });

  it('collapses the preview and surfaces an alert when the dry run fails', async () => {
    mockedApi.previewExportPreset.mockRejectedValue(new Error('not_found'));
    render(<ExportPresetsPanel />);

    const button = await screen.findByRole('button', {
      name: /preview export preset high score responses/i,
    });
    fireEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('not_found');
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).toHaveTextContent('Preview');
    });
  });

  it('renames a preset inline: save updates the row, cancel never calls the api', async () => {
    mockedApi.renameExportPreset.mockResolvedValue({
      ...hoisted.presetCsv,
      name: 'Weekly digest',
    });
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /rename export preset high score responses/i }),
    );

    const input = await screen.findByRole('textbox', { name: /rename export preset/i });
    // Cancel path first: no API call, original row untouched.
    fireEvent.change(input, { target: { value: 'Weekly digest' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel renaming export preset/i }));
    expect(mockedApi.renameExportPreset).not.toHaveBeenCalled();
    expect(screen.getByText('High Score Responses')).toBeInTheDocument();

    // Now the real rename.
    fireEvent.click(screen.getByRole('button', { name: /rename export preset high score responses/i }));
    fireEvent.change(
      screen.getByRole('textbox', { name: /rename export preset high score responses/i }),
      { target: { value: 'Weekly digest' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^save name for export preset/i }));

    await waitFor(() => {
      expect(mockedApi.renameExportPreset).toHaveBeenCalledWith(3, 'Weekly digest');
      expect(screen.getByText('Weekly digest')).toBeInTheDocument();
      expect(screen.queryByText('High Score Responses')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Renamed to "Weekly digest".');
    });
  });

  it('surfaces a failed rename as an alert and keeps the editor open', async () => {
    mockedApi.renameExportPreset.mockRejectedValue(
      new apiModule.ApiError('Please slow down.', 429),
    );
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /rename export preset high score responses/i }),
    );
    const input = screen.getByRole('textbox', { name: /rename export preset high score responses/i });
    fireEvent.change(input, { target: { value: 'Better name' } });
    fireEvent.click(screen.getByRole('button', { name: /^save name for export preset/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please slow down.');
    // The editor stays open with the draft intact so nothing is lost.
    expect(screen.getByRole('textbox', { name: /rename export preset high score responses/i }))
      .toBeInTheDocument();
    expect(screen.getByDisplayValue('Better name')).toBeInTheDocument();
  });

  it('disables saving a rename when the draft is blank', async () => {
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /rename export preset high score responses/i }),
    );
    const input = await screen.findByRole('textbox', { name: /rename export preset high score responses/i });
    fireEvent.change(input, { target: { value: '   ' } });

    expect(
      screen.getByRole('button', { name: /^save name for export preset/i }),
    ).toBeDisabled();
  });

  it('shows the default badge and offers Make default only on other rows', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      hoisted.presetCsv,
      { ...hoisted.presetCsv, id: 9, name: 'Recent Responses', format: 'json', is_default: false },
      { ...hoisted.presetCsv, id: 4, name: 'The Chosen One', is_default: true },
    ]);
    render(<ExportPresetsPanel />);

    expect(await screen.findByText('Default')).toBeInTheDocument();
    // Non-default rows can be promoted…
    expect(screen.getByRole('button', { name: /^make high score responses the default/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^make recent responses the default/i })).toBeInTheDocument();
    // …but the current default cannot.
    expect(
      screen.queryByRole('button', { name: /^make the chosen one the default/i }),
    ).not.toBeInTheDocument();
  });

  it('promotes a preset to default and moves the badge in place', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, id: 3, name: 'Alpha', is_default: true },
      { ...hoisted.presetCsv, id: 5, name: 'Beta', is_default: false },
    ]);
    mockedApi.setDefaultExportPreset.mockResolvedValue({
      ...hoisted.presetCsv,
      id: 5,
      name: 'Beta',
      is_default: true,
    });
    render(<ExportPresetsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /^make beta the default/i }));

    await waitFor(() => {
      expect(mockedApi.setDefaultExportPreset).toHaveBeenCalledWith(5);
      expect(screen.getByRole('status')).toHaveTextContent('"Beta" is now the default');
    });
    expect(screen.getByText('Default')).toBeInTheDocument();
    // Beta no longer offers promotion; Alpha now does.
    expect(screen.queryByRole('button', { name: /^make beta the default/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^make alpha the default/i })).toBeInTheDocument();
  });

  it('surfaces a failed default switch as an alert without moving the badge', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, id: 3, name: 'Alpha', is_default: true },
      { ...hoisted.presetCsv, id: 5, name: 'Beta', is_default: false },
    ]);
    mockedApi.setDefaultExportPreset.mockRejectedValue(
      new apiModule.ApiError('Please slow down.', 429),
    );
    render(<ExportPresetsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /^make beta the default/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please slow down.');
    expect(screen.getByText(/alpha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^make beta the default/i })).toBeInTheDocument();
  });

  it('moves a preset up and persists the swapped order', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, id: 3, name: 'Alpha', is_default: true },
      { ...hoisted.presetCsv, id: 5, name: 'Beta', is_default: false },
    ]);
    mockedApi.reorderExportPresets.mockResolvedValue({ status: 'reordered', updatedCount: 2 });
    render(<ExportPresetsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /move export preset beta up/i }));

    await waitFor(() => {
      expect(mockedApi.reorderExportPresets).toHaveBeenCalledWith([5, 3]);
      expect(screen.getByRole('status')).toHaveTextContent('Moved "Beta" up.');
    });
    // The rows swap in place without a refetch.
    const names = screen.getAllByText(/^(Alpha|Beta)$/);
    expect(names[0]).toHaveTextContent('Beta');
    expect(names[1]).toHaveTextContent('Alpha');
  });

  it('hides Move up on the first row and Move down on the last row', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, id: 3, name: 'Alpha' },
      { ...hoisted.presetCsv, id: 5, name: 'Beta' },
    ]);
    render(<ExportPresetsPanel />);

    expect(
      await screen.findByRole('button', { name: /move export preset alpha up/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /move export preset beta down/i })).toBeDisabled();
    // The interior edges still work.
    expect(screen.getByRole('button', { name: /move export preset alpha down/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /move export preset beta up/i })).toBeEnabled();
  });

  it('restores the previous order when reordering fails', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, id: 3, name: 'Alpha' },
      { ...hoisted.presetCsv, id: 5, name: 'Beta' },
    ]);
    mockedApi.reorderExportPresets.mockRejectedValue(
      new apiModule.ApiError('Please slow down.', 429),
    );
    render(<ExportPresetsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /move export preset beta up/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please slow down.');
    const names = screen.getAllByText(/^(Alpha|Beta)$/);
    expect(names[0]).toHaveTextContent('Alpha');
    expect(names[1]).toHaveTextContent('Beta');
  });

  it('hides the move buttons while that row is being renamed', async () => {
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /rename export preset high score responses/i }),
    );

    expect(
      screen.queryByRole('button', { name: /move export preset high score responses/i }),
    ).not.toBeInTheDocument();
  });

  it('shows how long ago a preset was last used', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      {
        ...hoisted.presetCsv,
        last_used_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
    ]);
    render(<ExportPresetsPanel />);

    expect(await screen.findByText(/used 5m ago/)).toBeInTheDocument();
    // The stamp shares the metadata line with the filter summary.
    expect(screen.getByText(/score ≥ 80/)).toHaveTextContent('used 5m ago');
  });

  it('omits the last-used stamp when a preset has never been downloaded', async () => {
    render(<ExportPresetsPanel />);

    expect(await screen.findByText('High Score Responses')).toBeInTheDocument();
    expect(screen.queryByText(/used .* ago/)).not.toBeInTheDocument();
  });

  it('selects presets in select mode and bulk-deletes them', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, id: 3, name: 'Alpha' },
      { ...hoisted.presetCsv, id: 5, name: 'Beta' },
    ]);
    mockedApi.bulkDeleteExportPresets.mockResolvedValue({ status: 'bulk_deleted', deletedCount: 2 });
    render(<ExportPresetsPanel />);

    // Selection mode replaces the per-row actions with checkboxes.
    fireEvent.click(await screen.findByRole('button', { name: /select export presets/i }));
    expect(screen.queryByRole('button', { name: /download export preset alpha/i })).not
      .toBeInTheDocument();

    const alpha = screen.getByRole('checkbox', { name: /select export preset alpha/i });
    const beta = screen.getByRole('checkbox', { name: /select export preset beta/i });
    // Nothing selected yet — the delete button refuses to fire.
    expect(screen.getByRole('button', { name: /delete selected export presets/i })).toBeDisabled();

    fireEvent.click(alpha);
    fireEvent.click(beta);
    expect(alpha).toBeChecked();
    expect(beta).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /delete selected export presets/i }));
    await waitFor(() => {
      expect(mockedApi.bulkDeleteExportPresets).toHaveBeenCalledWith([3, 5], false);
      expect(screen.getByRole('status')).toHaveTextContent('Deleted 2 presets.');
    });
    // Both rows are gone and selection mode exited.
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /select export preset/i })).not.toBeInTheDocument();
  });

  it('offers an explicit force retry when the default preset blocks the delete', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, id: 3, name: 'Alpha', is_default: true },
      { ...hoisted.presetCsv, id: 5, name: 'Beta' },
    ]);
    mockedApi.bulkDeleteExportPresets
      .mockRejectedValueOnce(
        new apiModule.ApiError('Cannot delete default preset(s) without force=true.', 400, {
          error: 'default_preset_protected',
          protected_ids: [3],
        }),
      )
      .mockResolvedValueOnce({ status: 'bulk_deleted', deletedCount: 2 });
    render(<ExportPresetsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /select export presets/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select export preset alpha/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select export preset beta/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete selected export presets/i }));

    // The refusal surfaces as an alert and the bar switches to an
    // explicit confirmation, selection intact.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot delete default preset(s) without force=true.',
    );
    expect(screen.getByText(/default preset is in the selection/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /confirm deleting selected presets including your default/i }),
    );
    await waitFor(() => {
      expect(mockedApi.bulkDeleteExportPresets).toHaveBeenLastCalledWith([3, 5], true);
      expect(screen.getByRole('status')).toHaveTextContent('Deleted 2 presets.');
    });
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('cancel exits select mode and clears the selection', async () => {
    mockedApi.listExportPresets.mockResolvedValue([{ ...hoisted.presetCsv, id: 3, name: 'Alpha' }]);
    render(<ExportPresetsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /select export presets/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select export preset alpha/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel selecting export presets/i }));

    expect(mockedApi.bulkDeleteExportPresets).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox', { name: /select export preset/i })).not.toBeInTheDocument();
    // Re-entering starts from a clean selection.
    fireEvent.click(screen.getByRole('button', { name: /select export presets/i }));
    expect(screen.getByRole('button', { name: /delete selected export presets/i })).toBeDisabled();
  });

  it('selects everything with All and empties the selection with None', async () => {
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, id: 3, name: 'Alpha' },
      { ...hoisted.presetCsv, id: 5, name: 'Beta' },
      { ...hoisted.presetCsv, id: 7, name: 'Gamma' },
    ]);
    render(<ExportPresetsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /select export presets/i }));
    const all = screen.getByRole('button', { name: /select every export preset/i });
    // A fresh selection is empty, so All is available.
    expect(all).toBeEnabled();

    // Selecting one manually doesn't complete the set.
    fireEvent.click(screen.getByRole('checkbox', { name: /select export preset alpha/i }));
    expect(all).toBeEnabled();

    fireEvent.click(all);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /select export preset beta/i })).toBeChecked();
    // Nothing left to add — All disables at a full selection.
    expect(all).toBeDisabled();

    const none = screen.getByRole('button', { name: /clear selected export presets/i });
    fireEvent.click(none);
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(none).toBeDisabled();
    expect(all).toBeEnabled();
  });

  it('exits selection mode when Escape is pressed on a checkbox', async () => {
    mockedApi.listExportPresets.mockResolvedValue([{ ...hoisted.presetCsv, id: 3, name: 'Alpha' }]);
    render(<ExportPresetsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /select export presets/i }));
    fireEvent.keyDown(
      screen.getByRole('checkbox', { name: /select export preset alpha/i }),
      { key: 'Escape' },
    );

    expect(mockedApi.bulkDeleteExportPresets).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox', { name: /select export preset/i })).not.toBeInTheDocument();
  });

  it('backs the library up to a dated JSON file and reports the count', async () => {
    mockedApi.exportPresetsBackup.mockResolvedValue({
      version: '1',
      exportedAt: '2026-08-23T05:00:00',
      totalPresets: 1,
      presets: [
        {
          name: 'High Score Responses',
          description: null,
          preset_type: 'saved',
          format: 'csv',
          search: null,
          persona_id: null,
          min_score: null,
          max_score: null,
          sort: null,
        },
      ],
    });
    vi.mocked(downloadModule.downloadJsonFile).mockReturnValue(true);
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /back up export presets to a json file/i }),
    );

    await waitFor(() => {
      expect(mockedApi.exportPresetsBackup).toHaveBeenCalled();
      expect(downloadModule.downloadJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('"presets"'),
        'arena-preset-backup',
      );
      expect(screen.getByRole('status')).toHaveTextContent('Backed up 1 preset to JSON.');
    });
  });

  it('surfaces a failed backup as an alert without losing rows', async () => {
    mockedApi.exportPresetsBackup.mockRejectedValue(
      new apiModule.ApiError('Please slow down.', 429),
    );
    render(<ExportPresetsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /back up export presets to a json file/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Please slow down.');
    expect(screen.getByText('High Score Responses')).toBeInTheDocument();
  });

  it('restores presets from a chosen backup file and refetches the list', async () => {
    mockedApi.importPresetsBackup.mockResolvedValue({
      importedCount: 2,
      skippedCount: 0,
      duplicatedNames: ['High Score Responses'],
    });
    render(<ExportPresetsPanel />);
    await screen.findByText('High Score Responses');

    const backupFile = new File([], 'backup.json', { type: 'application/json' });
    // jsdom lacks Blob#text(), so stub the read the handler performs.
    backupFile.text = async () =>
      JSON.stringify({ version: 1, presets: [{ name: 'A' }, { name: 'B' }] });
    const input = screen.getByLabelText(/choose a preset backup file to restore/i);
    Object.defineProperty(input, 'files', { value: [backupFile] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(mockedApi.importPresetsBackup).toHaveBeenCalledWith([
        { name: 'A' },
        { name: 'B' },
      ]);
      // The list refetches because the server assigns fresh ids/positions.
      expect(mockedApi.listExportPresets).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Restored 2 presets. 1 name matches an existing preset — suffixed with "Imported".',
      );
    });
  });

  it('rejects a non-JSON restore file with an honest message', async () => {
    render(<ExportPresetsPanel />);
    await screen.findByText('High Score Responses');

    const bad = new File(['not json at all'], 'backup.json', { type: 'application/json' });
    const input = screen.getByLabelText(/choose a preset backup file to restore/i);
    Object.defineProperty(input, 'files', { value: [bad] });
    fireEvent.change(input);

    expect(await screen.findByRole('alert')).toHaveTextContent("isn't valid JSON");
    expect(mockedApi.importPresetsBackup).not.toHaveBeenCalled();
  });

  it('rejects a JSON file with no presets in it', async () => {
    render(<ExportPresetsPanel />);
    await screen.findByText('High Score Responses');

    const empty = new File([], 'backup.json', { type: 'application/json' });
    empty.text = async () => JSON.stringify({ something: 'else' });
    const input = screen.getByLabelText(/choose a preset backup file to restore/i);
    Object.defineProperty(input, 'files', { value: [empty] });
    fireEvent.change(input);

    expect(await screen.findByRole('alert')).toHaveTextContent('No presets found in that file');
  });

  it("mentions skipped rows when part of a restore didn't import", async () => {
    mockedApi.importPresetsBackup.mockResolvedValue({
      importedCount: 1,
      skippedCount: 2,
      duplicatedNames: [],
    });
    render(<ExportPresetsPanel />);
    await screen.findByText('High Score Responses');

    const file = new File([], 'backup.json', { type: 'application/json' });
    file.text = async () => JSON.stringify({ presets: [{ name: 'A' }] });
    const input = screen.getByLabelText(/choose a preset backup file to restore/i);
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Restored 1 preset. 2 rows couldn\'t be imported.',
    );
  });

  it('updates the used stamp in place after downloading a preset', async () => {
    mockedApi.useExportPreset.mockResolvedValue({
      blob: new Blob(['id,prompt'], { type: 'text/csv' }),
      filename: 'arena-saved-export.csv',
    });
    mockedApi.listExportPresets.mockResolvedValue([
      { ...hoisted.presetCsv, last_used_at: null },
    ]);
    render(<ExportPresetsPanel />);

    // No stamp before the download…
    expect(await screen.findByText('High Score Responses')).toBeInTheDocument();
    expect(screen.queryByText(/used .* ago/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /download export preset high score responses/i }),
    );

    // …and "just now" right after — mirrored locally, not on a refetch.
    expect(await screen.findByRole('status')).toHaveTextContent('Downloaded');
    await waitFor(() => {
      expect(screen.getByText(/used just now/)).toBeInTheDocument();
    });
  });

  it('explains why Back up is disabled when the library is empty', async () => {
    mockedApi.listExportPresets.mockResolvedValue([]);
    render(<ExportPresetsPanel />);

    const backup = await screen.findByRole('button', {
      name: /back up export presets to a json file/i,
    });
    expect(backup).toBeDisabled();
    expect(backup).toHaveAttribute('title', 'Nothing to back up yet — add a preset first');
  });
});
