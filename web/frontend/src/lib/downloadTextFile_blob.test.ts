import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlobFile } from './downloadTextFile';

describe('downloadBlobFile', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('triggers a download for valid Blob and returns true', () => {
    const blob = new Blob(['col1,col2\nval1,val2'], { type: 'text/csv' });
    const result = downloadBlobFile(blob, 'analytics-report.csv');
    expect(result).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('handles invalid Blob inputs safely', () => {
    expect(downloadBlobFile(null as unknown as Blob, 'test.csv')).toBe(false);
    expect(downloadBlobFile('not a blob' as unknown as Blob, 'test.csv')).toBe(false);
  });

  it('sanitizes bad filename characters', () => {
    const blob = new Blob(['data'], { type: 'text/csv' });
    const result = downloadBlobFile(blob, '../../etc/passwd.csv');
    expect(result).toBe(true);
  });
});
