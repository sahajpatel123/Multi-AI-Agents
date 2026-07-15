/** Pure helpers for the Arena collapsible prompt chrome. */

export const COLLAPSIBLE_PROMPT_THRESHOLD = 120;

export function isCollapsiblePrompt(text: string, threshold = COLLAPSIBLE_PROMPT_THRESHOLD): boolean {
  return (text || '').length > threshold;
}

export function collapsiblePromptAriaLabel(expanded: boolean): string {
  return expanded ? 'Collapse full prompt' : 'Expand full prompt';
}

export function collapsiblePromptHint(expanded: boolean): string {
  return expanded ? 'Collapse ↑' : 'Read full prompt ↓';
}
