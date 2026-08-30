import { copyJsonlToClipboard } from './clipboard';
import { isAgentOrchestrationHistoryJsonlExport } from './agentOrchestrationJson';

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
    if (!isAgentOrchestrationHistoryJsonlExport(text)) return false;

    return await copyJsonlToClipboard(text);
  } catch {
    return false;
  }
}
