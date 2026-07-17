import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';

function pressKey(key: string, target: EventTarget | null = window) {
  fireEvent.keyDown(target ?? window, { key });
}

describe('KeyboardShortcutsHelp', () => {
  it('renders nothing by default (closed)', () => {
    const { container } = render(
      <KeyboardShortcutsHelp surface="arena" />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens when ? is pressed (bare question mark)', async () => {
    const { container } = render(
      <KeyboardShortcutsHelp surface="arena" />,
    );
    pressKey('?');
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    });
  });

  it('does not open when ? is pressed inside a text field', () => {
    const { container } = render(
      <KeyboardShortcutsHelp surface="arena" />,
    );
    // Create a fake textfield target.
    const input = document.createElement('input');
    document.body.appendChild(input);
    pressKey('?', input);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    document.body.removeChild(input);
  });

  it('Escape closes the panel', async () => {
    const { container } = render(
      <KeyboardShortcutsHelp surface="arena" />,
    );
    pressKey('?');
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    });
    pressKey('Escape');
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  it('toggles: ?  ?  closes the panel', async () => {
    const { container } = render(
      <KeyboardShortcutsHelp surface="arena" />,
    );
    pressKey('?');
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    });
    pressKey('?');
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  it('uses role=dialog and aria-modal=true', async () => {
    render(<KeyboardShortcutsHelp surface="arena" />);
    pressKey('?');
    await waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });
});