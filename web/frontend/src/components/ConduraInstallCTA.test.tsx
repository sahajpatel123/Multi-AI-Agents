import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConduraInstallCTA } from './ConduraInstallCTA';

const onCloseMock = vi.fn();
const onSendToConduraMock = vi.fn();
const onSaveDraftMock = vi.fn();
const probeLocalConduraMock = vi.fn();
const copyToClipboardMock = vi.fn();
const listConduraHandoffDraftsMock = vi.fn();
const deleteConduraHandoffDraftMock = vi.fn();

const probeState: { kind: 'unknown' | 'not_installed' | 'installed_not_running' | 'ready'; version?: string } = {
  kind: 'unknown',
};

vi.mock('../lib/conduraLocalProbe', () => ({
  probeLocalCondura: (...args: unknown[]) => probeLocalConduraMock(...args),
}));

vi.mock('../api', () => ({
  listConduraHandoffDrafts: (...args: unknown[]) =>
    listConduraHandoffDraftsMock(...args),
  deleteConduraHandoffDraft: (...args: unknown[]) =>
    deleteConduraHandoffDraftMock(...args),
}));

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboardMock(...args),
}));

vi.mock('../components/MotionButton', () => ({
  MotionButton: ({
    children,
    onClick,
    disabled,
    loading,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-loading={loading ? 'true' : 'false'}
    >
      {children}
    </button>
  ),
}));

function renderCta(
  overrides: Partial<React.ComponentProps<typeof ConduraInstallCTA>> = {},
) {
  return render(
    <ConduraInstallCTA
      open
      onClose={onCloseMock}
      onSendToCondura={onSendToConduraMock}
      onSaveDraft={onSaveDraftMock}
      {...overrides}
    />,
  );
}

describe('ConduraInstallCTA', () => {
  beforeEach(() => {
    onCloseMock.mockReset();
    onSendToConduraMock.mockReset();
    onSaveDraftMock.mockReset();
    probeLocalConduraMock.mockReset();
    copyToClipboardMock.mockReset();
    listConduraHandoffDraftsMock.mockReset();
    deleteConduraHandoffDraftMock.mockReset();
    copyToClipboardMock.mockResolvedValue(true);
    probeLocalConduraMock.mockResolvedValue({ kind: 'not_installed' });
    // No saved handoffs by default: the section stays out of the way of
    // the pre-existing tests.
    listConduraHandoffDraftsMock.mockResolvedValue({ drafts: [], total: 0, totalPages: 0 });
    probeState.kind = 'unknown';
  });

  it('renders nothing when open is false', () => {
    const { container } = renderCta({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders a role="dialog" with the right ARIA labelling when open', () => {
    renderCta();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'condura-cta-title');
    // The default title is the "This needs your machine" copy.
    expect(
      screen.getByRole('heading', { name: 'This needs your machine' }),
    ).toBeInTheDocument();
  });

  it('renders a custom title + message when provided', () => {
    renderCta({ title: 'Custom CTA title', message: 'Custom CTA message body' });
    expect(
      screen.getByRole('heading', { name: 'Custom CTA title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Custom CTA message body')).toBeInTheDocument();
  });

  it('renders the Close button that calls onClose', () => {
    renderCta();
    const closeButton = screen.getByRole('button', { name: 'Close' });
    closeButton.click();
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('dismisses the dialog when the overlay backdrop is clicked', () => {
    renderCta();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT dismiss when the panel itself is clicked (stopPropagation)', () => {
    renderCta();
    const panel = screen.getByRole('dialog').firstChild as HTMLElement;
    fireEvent.click(panel);
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it('uses the BEM class tree on the overlay + panel + actions', () => {
    const { container } = renderCta();
    expect(container.querySelector('.condura-cta-overlay')).toBeTruthy();
    expect(container.querySelector('.condura-cta-panel')).toBeTruthy();
    expect(container.querySelector('.condura-cta__header')).toBeTruthy();
    expect(container.querySelector('.condura-cta__title')).toBeTruthy();
    expect(container.querySelector('.condura-cta__actions')).toBeTruthy();
  });

  const savedDraft = {
    id: 3,
    capability: 'file.organize',
    payload: { intent: { capability: 'file.organize', summary: 'Tidy the downloads folder' } },
    createdAt: new Date().toISOString(),
  };

  it('lists saved handoffs when open and labels them by their intent summary', async () => {
    listConduraHandoffDraftsMock.mockResolvedValue({
      drafts: [savedDraft],
      total: 1,
      totalPages: 1,
    });
    renderCta();

    expect(await screen.findByText('Tidy the downloads folder')).toBeInTheDocument();
    expect(screen.getByText(/saved handoffs \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/file\.organize · just now/)).toBeInTheDocument();
    expect(listConduraHandoffDraftsMock).toHaveBeenCalledWith({ perPage: 20 });
  });

  it('hides the saved-handoffs section entirely when there are none', async () => {
    renderCta();
    await waitFor(() => {
      expect(listConduraHandoffDraftsMock).toHaveBeenCalled();
    });
    expect(screen.queryByText(/saved handoffs \(/i)).not.toBeInTheDocument();
  });

  it('re-copies a saved handoff link from its stored payload', async () => {
    listConduraHandoffDraftsMock.mockResolvedValue({
      drafts: [savedDraft],
      total: 1,
      totalPages: 1,
    });
    renderCta();

    fireEvent.click(
      await screen.findByRole('button', { name: /copy link for saved handoff/i }),
    );
    await waitFor(() => {
      // The stored payload rides along as base64 in a condura:// link.
      expect(copyToClipboardMock).toHaveBeenCalledWith(
        expect.stringContaining('condura://arena/handoff?payload='),
      );
    });
    // The row confirms itself.
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('deletes a saved handoff only after an inline confirm', async () => {
    listConduraHandoffDraftsMock.mockResolvedValue({
      drafts: [savedDraft],
      total: 1,
      totalPages: 1,
    });
    deleteConduraHandoffDraftMock.mockResolvedValue(undefined);
    renderCta();

    fireEvent.click(
      await screen.findByRole('button', { name: /delete saved handoff tidy the downloads folder/i }),
    );
    // Arming sends nothing.
    expect(deleteConduraHandoffDraftMock).not.toHaveBeenCalled();
    expect(screen.getByText('Delete forever?')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /confirm deleting saved handoff tidy the downloads folder/i }),
    );
    await waitFor(() => {
      expect(deleteConduraHandoffDraftMock).toHaveBeenCalledWith(3);
      expect(screen.queryByText('Tidy the downloads folder')).not.toBeInTheDocument();
    });
  });

  it('surfaces a delete refusal verbatim and keeps the row', async () => {
    listConduraHandoffDraftsMock.mockResolvedValue({
      drafts: [savedDraft],
      total: 1,
      totalPages: 1,
    });
    deleteConduraHandoffDraftMock.mockRejectedValue(
      new Error('Too many handoff-draft delete attempts. Please slow down.'),
    );
    renderCta();

    fireEvent.click(
      await screen.findByRole('button', { name: /delete saved handoff tidy the downloads folder/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /confirm deleting saved handoff tidy the downloads folder/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many handoff-draft delete attempts. Please slow down.',
    );
    expect(screen.getByText('Tidy the downloads folder')).toBeInTheDocument();
  });

  it('shows a drafts load failure instead of pretending nothing was saved', async () => {
    listConduraHandoffDraftsMock.mockRejectedValue(new Error('backend unreachable'));
    renderCta();

    expect(await screen.findByRole('alert')).toHaveTextContent('backend unreachable');
    expect(screen.queryByText(/tidy the downloads folder/i)).not.toBeInTheDocument();
  });

  it('marks drafts whose 24-hour signature window has passed', async () => {
    const expired = {
      id: 4,
      capability: 'file.organize',
      payload: {
        intent: { capability: 'file.organize', summary: 'Old tidy request' },
        auth: { expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      },
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    };
    listConduraHandoffDraftsMock.mockResolvedValue({
      drafts: [expired, savedDraft],
      total: 2,
      totalPages: 1,
    });
    renderCta();

    expect(await screen.findByText('· signature expired')).toBeInTheDocument();
    // The copy button explains itself instead of pretending the link works.
    expect(
      screen.getByRole('button', { name: /copy link for saved handoff old tidy request/i }),
    ).toHaveAttribute('title', expect.stringContaining('24-hour'));
    // A draft without an expiry stamp (or an unexpired one) gets no warning.
    const freshCopy = screen.getByRole('button', {
      name: /copy link for saved handoff tidy the downloads folder/i,
    });
    expect(freshCopy.getAttribute('title')).toBeNull();
    expect(screen.getAllByText(/signature expired/)).toHaveLength(1);
  });
});
