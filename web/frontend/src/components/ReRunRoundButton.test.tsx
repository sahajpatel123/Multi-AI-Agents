import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { ReRunRoundButton } from './ReRunRoundButton';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReRunRoundButton', () => {
  it('renders nothing when the prompt is blank', () => {
    const { container } = render(
      <ReRunRoundButton prompt="   " onReRun={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a labelled button with the prompt as its tooltip', () => {
    const { getByRole } = render(
      <ReRunRoundButton prompt="Should I launch?" onReRun={() => {}} />,
    );
    const button = getByRole('button', { name: 'Re-run round' });
    expect(button).toHaveAttribute('title', 'Should I launch?');
  });

  it('fires onReRun when clicked', () => {
    const onReRun = vi.fn();
    const { getByRole } = render(
      <ReRunRoundButton prompt="Try again" onReRun={onReRun} />,
    );
    fireEvent.click(getByRole('button', { name: 'Re-run round' }));
    expect(onReRun).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled', () => {
    const onReRun = vi.fn();
    const { getByRole } = render(
      <ReRunRoundButton prompt="Wait" disabled onReRun={onReRun} />,
    );
    const button = getByRole('button', { name: 'Re-run round' }) as HTMLButtonElement;
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onReRun).not.toHaveBeenCalled();
  });

  it('keeps an accessible label when compact but hides the visible text', () => {
    const { getByRole } = render(
      <ReRunRoundButton prompt="Again" compact onReRun={() => {}} />,
    );
    const button = getByRole('button', { name: 'Re-run round' });
    expect(button).not.toHaveTextContent('Re-run round');
    expect(button).toHaveAttribute('title', 'Again');
  });
});
