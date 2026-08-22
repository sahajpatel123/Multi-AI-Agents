import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { ExportPresetsPanel } from './ExportPresetsPanel';
import * as apiModule from '../api';
import * as downloadModule from '../lib/downloadTextFile';

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  listExportPresets: vi.fn(),
  listExportPresetTemplates: vi.fn(),
  createExportPresetFromTemplate: vi.fn(),
  deleteExportPreset: vi.fn(),
  useExportPreset: vi.fn(),
  previewExportPreset: vi.fn(),
}));

vi.mock('../lib/downloadTextFile', () => ({
  downloadBlobFile: vi.fn(),
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
    expect(screen.getByText('The Analyst: Anchor the claim. (92)')).toBeInTheDocument();
    expect(screen.getByText('Second take.')).toBeInTheDocument();
    expect(
      screen.getByText(/\+10 more in the full export/),
    ).toBeInTheDocument();
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
});
