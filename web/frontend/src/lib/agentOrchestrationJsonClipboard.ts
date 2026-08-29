import { copyJsonToClipboard } from './clipboard';

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read JSON export')));
    reader.readAsText(blob);
  });
}

/**
 * Copy a validated orchestration JSON export with both application/json and
 * plain-text clipboard representations. Keep the adapter total so a browser
 * clipboard refusal never escapes into the page event handler.
 */
export async function copyAgentOrchestrationJson(blob: Blob): Promise<boolean> {
  try {
    const text = await readBlobText(blob);
    if (!text.trim()) return false;

    const payload: unknown = JSON.parse(text);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

    return await copyJsonToClipboard(text);
  } catch {
    return false;
  }
}
