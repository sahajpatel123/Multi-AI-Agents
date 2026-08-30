import { copyJsonlToClipboard } from './clipboard';
import { isAgentOrchestrationHistoryJsonExport } from './agentOrchestrationJson';

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      resolve(typeof reader.result === 'string' ? reader.result : ''),
    );
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('Could not read orchestration history JSONL')),
    );
    reader.readAsText(blob);
  });
}

/** Copy a validated orchestration-history JSONL export without rewriting its lines. */
export async function copyAgentOrchestrationHistoryJsonl(blob: Blob): Promise<boolean> {
  try {
    const text = await readBlobText(blob);
    if (!text.trim()) return false;

    const rows: unknown[] = text
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as unknown);
    if (!isAgentOrchestrationHistoryJsonExport(rows)) return false;

    return await copyJsonlToClipboard(text);
  } catch {
    return false;
  }
}
