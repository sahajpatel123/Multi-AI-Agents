import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from './api';
import {
  listExportPresets,
  listExportPresetTemplates,
  createExportPresetFromTemplate,
  deleteExportPreset,
  useExportPreset,
  previewExportPreset,
  renameExportPreset,
  reorderExportPresets,
  setDefaultExportPreset,
  bulkDeleteExportPresets,
  exportPresetsBackup,
  importPresetsBackup,
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

  describe('previewExportPreset', () => {
    it('normalizes the dry-run payload', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            preset_id: 3,
            match_count: 12,
            filters: { search: null, sort: 'score' },
            preview: [
              {
                id: 7,
                persona_id: 'analyst',
                persona_name: 'The Analyst',
                score: 92,
                confidence: 88,
                one_liner: 'Anchor the claim.',
                saved_at: '2026-08-06T20:00:00Z',
              },
            ],
            preview_limit: 5,
            truncated: true,
          }),
          { status: 200 },
        ),
      );

      const res = await previewExportPreset(3);
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/3/preview', {});
      expect(res).toEqual({
        matchCount: 12,
        truncated: true,
        sort: 'score',
        search: null,
        sample: [
          {
            id: 7,
            persona_name: 'The Analyst',
            score: 92,
            one_liner: 'Anchor the claim.',
            saved_at: '2026-08-06T20:00:00Z',
          },
        ],
      });
    });

    it('tolerates a payload with no sample rows or filters block', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ match_count: 0, preview: [], truncated: false }), {
          status: 200,
        }),
      );
      const res = await previewExportPreset(3);
      expect(res.matchCount).toBe(0);
      expect(res.sample).toEqual([]);
      expect(res.truncated).toBe(false);
      expect(res.sort).toBeNull();
      expect(res.search).toBeNull();
    });

    it('validates the id before fetching', async () => {
      await expect(previewExportPreset(0)).rejects.toThrow('presetId must be a positive integer');
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces server messages with request IDs', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'not_found' }), {
          status: 404,
          headers: { 'x-request-id': 'req-preview-404' },
        }),
      );
      await expect(previewExportPreset(99)).rejects.toThrow(
        'not_found (Request ID: req-preview-404)',
      );
    });

    it('falls back to the friendly message when the body has no detail', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response('bad gateway', {
          status: 502,
          headers: { 'x-request-id': 'req-preview-502' },
        }),
      );
      await expect(previewExportPreset(99)).rejects.toThrow(
        'Failed to preview export preset (Request ID: req-preview-502)',
      );
    });

    it('falls back to a friendly message when the body has no detail', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: { message: 'Preset is gone.' } }), {
          status: 404,
        }),
      );
      await expect(previewExportPreset(99)).rejects.toThrow('Preset is gone.');
    });
  });

  describe('renameExportPreset', () => {
    it('puts a trimmed name and returns the updated preset', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'updated', ...presetFixture, name: 'Weekly digest' }),
          { status: 200 },
        ),
      );

      const res = await renameExportPreset(3, '  Weekly digest  ');
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/3', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Weekly digest' }),
      });
      expect(res.name).toBe('Weekly digest');
    });

    it('validates the id and name before fetching', async () => {
      await expect(renameExportPreset(0, 'x')).rejects.toThrow(
        'presetId must be a positive integer',
      );
      await expect(renameExportPreset(3, '   ')).rejects.toThrow(
        'name must be between 1 and 100 characters',
      );
      await expect(renameExportPreset(3, 'x'.repeat(101))).rejects.toThrow(
        'name must be between 1 and 100 characters',
      );
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces server messages with request IDs', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Please slow down.' }), {
          status: 429,
          headers: { 'x-request-id': 'req-rename-429' },
        }),
      );
      await expect(renameExportPreset(3, 'New name')).rejects.toThrow(
        'Please slow down. (Request ID: req-rename-429)',
      );
    });
  });

  describe('setDefaultExportPreset', () => {
    it('puts only the is_default flag and returns the updated preset', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'updated', ...presetFixture, is_default: true }), {
          status: 200,
        }),
      );

      const res = await setDefaultExportPreset(3);
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/3', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      expect(res.is_default).toBe(true);
    });

    it('validates the id before fetching', async () => {
      await expect(setDefaultExportPreset(-2)).rejects.toThrow(
        'presetId must be a positive integer',
      );
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces failures with a friendly fallback when no detail is sent', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response('bad gateway', {
          status: 502,
          headers: { 'x-request-id': 'req-default-502' },
        }),
      );
      await expect(setDefaultExportPreset(3)).rejects.toThrow(
        'Failed to set the default export preset (Request ID: req-default-502)',
      );
    });
  });

  describe('reorderExportPresets', () => {
    it('posts the ids as an items envelope and reports the updated count', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'reordered', updated_count: 3 }), { status: 200 }),
      );

      const res = await reorderExportPresets([5, 3, 9]);
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: 5 }, { id: 3 }, { id: 9 }] }),
      });
      expect(res).toEqual({ status: 'reordered', updatedCount: 3 });
    });

    it('validates the id list before fetching', async () => {
      await expect(reorderExportPresets([])).rejects.toThrow(
        'orderedIds must contain at least one preset id',
      );
      await expect(reorderExportPresets([3, 0])).rejects.toThrow(
        'every preset id must be a positive integer',
      );
      await expect(reorderExportPresets([3, 1.5])).rejects.toThrow(
        'every preset id must be a positive integer',
      );
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces rate-limit failures with their message and request ID', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Too many export preset reorders.' }), {
          status: 429,
          headers: { 'x-request-id': 'req-reorder-429' },
        }),
      );

      await expect(reorderExportPresets([3, 5])).rejects.toThrow(
        'Too many export preset reorders. (Request ID: req-reorder-429)',
      );
    });

    it('falls back to a friendly message when reordering fails silently', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response('bad gateway', {
          status: 502,
          headers: { 'x-request-id': 'req-reorder-502' },
        }),
      );
      await expect(reorderExportPresets([3])).rejects.toThrow(
        'Failed to reorder export presets (Request ID: req-reorder-502)',
      );
    });
  });

  describe('bulkDeleteExportPresets', () => {
    it('posts ids and the force flag, returning the deleted count', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'bulk_deleted', deleted_count: 2 }), {
          status: 200,
        }),
      );

      const res = await bulkDeleteExportPresets([3, 5], true);
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [3, 5], force: true }),
      });
      expect(res).toEqual({ status: 'bulk_deleted', deletedCount: 2 });
    });

    it('defaults force to false', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'bulk_deleted', deleted_count: 1 }), {
          status: 200,
        }),
      );

      await bulkDeleteExportPresets([9]);
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [9], force: false }),
      });
    });

    it('validates the id list before fetching', async () => {
      await expect(bulkDeleteExportPresets([])).rejects.toThrow(
        'ids must contain at least one preset id',
      );
      await expect(bulkDeleteExportPresets([3, -1])).rejects.toThrow(
        'every preset id must be a positive integer',
      );
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('raises ApiError carrying the protected-default detail so callers can offer force', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              error: 'default_preset_protected',
              message: 'Cannot delete default preset(s) without force=true.',
              protected_ids: [4],
            },
          }),
          { status: 400 },
        ),
      );

      try {
        await bulkDeleteExportPresets([3, 4]);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.status).toBe(400);
        expect(apiError.message).toBe('Cannot delete default preset(s) without force=true.');
        expect(apiError.detail).toMatchObject({ error: 'default_preset_protected' });
      }
    });

    it('surfaces rate-limit failures with their message and request ID', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Too many bulk delete requests.' }), {
          status: 429,
          headers: { 'x-request-id': 'req-bulk-429' },
        }),
      );

      await expect(bulkDeleteExportPresets([3])).rejects.toThrow(
        'Too many bulk delete requests. (Request ID: req-bulk-429)',
      );
    });
  });

  describe('exportPresetsBackup', () => {
    it('normalizes the versioned backup envelope', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'exported',
            version: 1,
            user_id: 7,
            exported_at: '2026-08-23T05:00:00',
            total_presets: 2,
            presets: [
              { name: 'Alpha', format: 'csv', preset_type: 'saved', min_score: 80 },
              { name: 'Beta', format: 'json', description: 'All recent' },
            ],
          }),
          { status: 200 },
        ),
      );

      const backup = await exportPresetsBackup();
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/export', {});
      expect(backup.version).toBe('1');
      expect(backup.exportedAt).toBe('2026-08-23T05:00:00');
      expect(backup.totalPresets).toBe(2);
      expect(backup.presets[0]).toEqual({
        name: 'Alpha',
        description: null,
        preset_type: 'saved',
        format: 'csv',
        search: null,
        persona_id: null,
        min_score: 80,
        max_score: null,
        sort: null,
      });
      expect(backup.presets[1].description).toBe('All recent');
    });

    it('surfaces failures with the server message and request ID', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Please slow down.' }), {
          status: 429,
          headers: { 'x-request-id': 'req-backup-429' },
        }),
      );
      await expect(exportPresetsBackup()).rejects.toThrow(
        'Please slow down. (Request ID: req-backup-429)',
      );
    });
  });

  describe('importPresetsBackup', () => {
    it('posts the presets envelope and reports imported/skipped/duplicates', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'imported',
            imported_count: 2,
            imported_ids: [11, 12],
            skipped_count: 1,
            errors: [{ index: 2, error: 'bad row' }],
            duplicated_names: ['Alpha'],
          }),
          { status: 200 },
        ),
      );

      const entries = [{ name: 'Alpha', format: 'csv' }, { name: 'Beta', format: 'json' }];
      const res = await importPresetsBackup(entries);
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/export-presets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presets: entries }),
      });
      expect(res).toEqual({
        importedCount: 2,
        skippedCount: 1,
        duplicatedNames: ['Alpha'],
      });
    });

    it('refuses an empty entry list before fetching', async () => {
      await expect(importPresetsBackup([])).rejects.toThrow(
        'presets must contain at least one entry',
      );
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces the preset-limit refusal from the server', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              error: 'preset_limit_reached',
              message: 'Import would exceed preset limit (50). Delete some before importing.',
            },
          }),
          { status: 400, headers: { 'x-request-id': 'req-import-400' } },
        ),
      );
      await expect(importPresetsBackup([{ name: 'X' }])).rejects.toThrow(
        'Import would exceed preset limit (50). Delete some before importing. (Request ID: req-import-400)',
      );
    });
  });
});
