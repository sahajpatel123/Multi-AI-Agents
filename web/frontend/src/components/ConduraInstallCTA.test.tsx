import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConduraInstallCTA } from './ConduraInstallCTA';

const onCloseMock = vi.fn();
const onSendToConduraMock = vi.fn();
const onSaveDraftMock = vi.fn();
const probeLocalConduraMock = vi.fn();
const copyToClipboardMock = vi.fn();

const probeState: { kind: 'unknown' | 'not_installed' | 'installed_not_running' | 'ready'; version?: string } = {
  kind: 'unknown',
};

vi.mock('../lib/conduraLocalProbe', () => ({
  probeLocalCondura: (...args: unknown[]) => probeLocalConduraMock(...args),
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
    copyToClipboardMock.mockResolvedValue(true);
    probeLocalConduraMock.mockResolvedValue({ kind: 'not_installed' });
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
});
