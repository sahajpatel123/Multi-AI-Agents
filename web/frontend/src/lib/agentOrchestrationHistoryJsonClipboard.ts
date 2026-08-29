import { copyJsonToClipboard } from './clipboard';
import { isAgentOrchestrationHistoryJsonExport } from './agentOrchestrationJson';

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      resolve(typeof reader.result === 'string' ? reader.result : ''),
    );
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('Could not read orchestration history JSON')),
    );
    reader.readAsText(blob);
  });
}

/** Copy a validated orchestration-history export as structured JSON and plain text. */
export async function copyAgentOrchestrationHistoryJson(blob: Blob): Promise<boolean> {
  try {
    const text = await readBlobText(blob);
    if (!text.trim()) return false;

    const payload: unknown = JSON.parse(text);
    if (!isAgentOrchestrationHistoryJsonExport(payload)) return false;

    return await copyJsonToClipboard(text);
  } catch {
    return false;
  }
}
