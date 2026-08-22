import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from './api';
import {
  listExportPresets,
  listExportPresetTemplates,
  createExportPresetFromTemplate,
  deleteExportPreset,
  useExportPreset,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

const presetFixture = {
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

describe('export preset API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listExportPresets', () => {
    it('normalizes the envelope response', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ presets: [presetFixture], total: 1 }), { status: 200 }),
      );

      const presets = await listExportPresets();
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets', {});
      expect(presets).toEqual([presetFixture]);
    });

    it('keeps accepting a legacy bare-array response', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify([presetFixture]), { status: 200 }),
      );
      expect(await listExportPresets()).toEqual([presetFixture]);
    });

    it('returns an empty list when the payload has no presets', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      );
      expect(await listExportPresets()).toEqual([]);
    });

    it('surfaces server error messages with request IDs', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Please slow down.' }), {
          status: 429,
          headers: { 'x-request-id': 'req-presets-list' },
        }),
      );

      await expect(listExportPresets()).rejects.toThrow(
        'Please slow down. (Request ID: req-presets-list)',
      );
    });
  });

  describe('listExportPresetTemplates', () => {
    it('returns the template catalog', async () => {
      const template = {
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
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ templates: [template], total: 1 }), { status: 200 }),
      );

      const templates = await listExportPresetTemplates();
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/templates', {});
      expect(templates).toEqual([template]);
    });

    it('reports a load failure with the server message', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'nope' }), { status: 500 }),
      );
      await expect(listExportPresetTemplates()).rejects.toThrow('nope');
    });

    it('falls back to a friendly message when the server omits one', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response('gateway timeout', { status: 504 }),
      );
      await expect(listExportPresetTemplates()).rejects.toThrow(
        'Failed to load export preset templates',
      );
    });
  });

  describe('createExportPresetFromTemplate', () => {
    it('posts the template id and optional custom name as query params', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'created', ...presetFixture }), { status: 200 }),
      );

      const preset = await createExportPresetFromTemplate('high_score', 'My weekly export');
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
        '/api/export-presets/from-template?template_id=high_score&name=My+weekly+export',
        { method: 'POST' },
      );
      expect(preset).toEqual(presetFixture);
    });

    it('omits the name param when no custom name is given', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'created', ...presetFixture }), { status: 200 }),
      );

      await createExportPresetFromTemplate('recent');
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
        '/api/export-presets/from-template?template_id=recent',
        { method: 'POST' },
      );
    });

    it('rejects an empty template id before fetching', async () => {
      await expect(createExportPresetFromTemplate('   ')).rejects.toThrow(
        'templateId must not be empty',
      );
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces upgrade-required failures with their message and request ID', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              error: 'feature_not_allowed',
              message: 'Export presets require Plus or Pro subscription.',
            },
          }),
          { status: 403, headers: { 'x-request-id': 'req-tpl-403' } },
        ),
      );

      await expect(createExportPresetFromTemplate('high_score')).rejects.toThrow(
        'Export presets require Plus or Pro subscription. (Request ID: req-tpl-403)',
      );
    });
  });

  describe('deleteExportPreset', () => {
    it('deletes by id', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'deleted', id: 3 }), { status: 200 }),
      );

      await deleteExportPreset(3);
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/3', {
        method: 'DELETE',
      });
    });

    it('validates the id before fetching', async () => {
      await expect(deleteExportPreset(0)).rejects.toThrow('presetId must be a positive integer');
      await expect(deleteExportPreset(1.5)).rejects.toThrow('presetId must be a positive integer');
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces the server message on deletion failures', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'not_found' }), { status: 404 }),
      );
      await expect(deleteExportPreset(99)).rejects.toThrow('not_found');
    });

    it('falls back to a friendly message when deletion fails silently', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response('bad gateway', { status: 502 }),
      );
      await expect(deleteExportPreset(99)).rejects.toThrow('Failed to delete export preset');
    });
  });

  describe('useExportPreset', () => {
    it('follows the redirect to the real export and returns the server filename', async () => {
      const mockBlob = new Blob(['id,prompt'], { type: 'text/csv' });
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(mockBlob, {
          status: 200,
          headers: {
            'Content-Disposition': 'attachment; filename="arena-saved-export.csv"',
          },
        }),
      );

      const res = await useExportPreset(3, 'csv');
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/3/use', {
        method: 'POST',
      });
      expect(res.filename).toBe('arena-saved-export.csv');
    });

    it('falls back to a safe extension-based filename when none is provided', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(new Blob(['[]'], { type: 'application/json' }), { status: 200 }),
      );

      const res = await useExportPreset(7, 'xlsx');
      expect(res.filename).toBe('arena-preset-7-export.xlsx');
    });

    it('sanitizes hostile fallback extensions', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(new Blob(['x']), { status: 200 }),
      );

      const res = await useExportPreset(7, '../../etc/passwd');
      expect(res.filename).toBe('arena-preset-7-export.etcpasswd');
    });

    it('validates the id before fetching', async () => {
      await expect(useExportPreset(-1)).rejects.toThrow('presetId must be a positive integer');
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('raises ApiError carrying the request ID on rate-limit failures', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Too many export preset uses.' }), {
          status: 429,
          headers: { 'x-request-id': 'req-preset-use' },
        }),
      );

      try {
        await useExportPreset(3);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(429);
        expect((error as ApiError).message).toBe(
          'Too many export preset uses. (Request ID: req-preset-use)',
        );
      }
    });
  });
});
