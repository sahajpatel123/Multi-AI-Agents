import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { ShareDropdown } from './ShareDropdown';

// Stub the clipboard lib so the test environment doesn't try to write
// to a clipboard that doesn't exist.
vi.mock('../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

function installMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reduce : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

function makeAnchor() {
  const el = document.createElement('button');
  el.textContent = 'Share';
  document.body.appendChild(el);
  return { current: el };
}

function cleanupAnchor(ref: { current: HTMLElement | null }) {
  if (ref.current) ref.current.remove();
}

describe('ShareDropdown', () => {
  it('renders nothing when isOpen is false', () => {
    installMatchMedia(false);
    const anchor = makeAnchor();
    const { container } = render(
      <ShareDropdown
        agentId="agent_1"
        agentName="The Analyst"
        oneLiner="A take"
        prompt="What?"
        isOpen={false}
        onClose={() => {}}
        anchorRef={anchor}
      />,
    );
    expect(container.querySelector('[role="menu"]')).toBeNull();
    cleanupAnchor(anchor);
  });

  it('renders the menu with the four share options when open', () => {
    installMatchMedia(false);
    const anchor = makeAnchor();
    const { getAllByRole, getByText } = render(
      <ShareDropdown
        agentId="agent_1"
        agentName="The Analyst"
        oneLiner="A take"
        prompt="What?"
        isOpen
        onClose={() => {}}
        anchorRef={anchor}
      />,
    );
    expect(getByText(/Copy link/i)).toBeInTheDocument();
    expect(getByText(/Copy as text/i)).toBeInTheDocument();
    expect(getByText(/Post on X/i)).toBeInTheDocument();
    expect(getByText(/WhatsApp/i)).toBeInTheDocument();
    expect(getByText(/Share via email/i)).toBeInTheDocument();
    const items = getAllByRole('menuitem');
    // 5 share channels (4 channel buttons + native share, which
    // canUseNativeShare() in this jsdom reports as available).
    // The contract is "all four channels are present" — the exact
    // count is browser-dependent.
    expect(items.length).toBeGreaterThanOrEqual(4);
    cleanupAnchor(anchor);
  });

  it('fires onClose when Escape is pressed', async () => {
    installMatchMedia(false);
    const anchor = makeAnchor();
    const onClose = vi.fn();
    render(
      <ShareDropdown
        agentId="agent_1"
        agentName="The Analyst"
        oneLiner="A take"
        prompt="What?"
        isOpen
        onClose={onClose}
        anchorRef={anchor}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    cleanupAnchor(anchor);
  });

  it('Copy link button calls copyToClipboard with the share URL', async () => {
    installMatchMedia(false);
    const anchor = makeAnchor();
    const { getByText } = render(
      <ShareDropdown
        agentId="agent_1"
        agentName="The Analyst"
        oneLiner="A take"
        prompt="What?"
        isOpen
        onClose={() => {}}
        anchorRef={anchor}
      />,
    );
    const { copyToClipboard } = await import('../lib/clipboard');
    fireEvent.click(getByText(/Copy link/i));
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('agent_1'),
      ),
    );
    cleanupAnchor(anchor);
  });

  it('shows "Copied!" feedback after a successful copy', async () => {
    installMatchMedia(false);
    const anchor = makeAnchor();
    const { getByText } = render(
      <ShareDropdown
        agentId="agent_1"
        agentName="The Analyst"
        oneLiner="A take"
        prompt="What?"
        isOpen
        onClose={() => {}}
        anchorRef={anchor}
      />,
    );
    fireEvent.click(getByText(/Copy link/i));
    // The label flips to "Copied!" for 1.5s after a successful copy.
    await waitFor(() => expect(getByText(/Copied!/i)).toBeInTheDocument());
    cleanupAnchor(anchor);
  });

  it('honors prefers-reduced-motion (static menu class)', () => {
    installMatchMedia(true);
    const anchor = makeAnchor();
    const { container } = render(
      <ShareDropdown
        agentId="agent_1"
        agentName="The Analyst"
        oneLiner="A take"
        prompt="What?"
        isOpen
        onClose={() => {}}
        anchorRef={anchor}
      />,
    );
    const menu = container.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).toHaveClass('share-menu--static');
    cleanupAnchor(anchor);
  });

  it('applies share-menu chrome classes', () => {
    installMatchMedia(false);
    const anchor = makeAnchor();
    const { container } = render(
      <ShareDropdown
        agentId="agent_1"
        agentName="The Analyst"
        oneLiner="A take"
        prompt="What?"
        isOpen
        onClose={() => {}}
        anchorRef={anchor}
      />,
    );
    expect(container.querySelector('.share-menu')).not.toBeNull();
    expect(container.querySelectorAll('.share-menu__item').length).toBeGreaterThanOrEqual(4);
    cleanupAnchor(anchor);
  });
});