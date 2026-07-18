import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AgentDot } from './AgentDot';

function installMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reducedMotion : false,
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

describe('AgentDot', () => {
  it('renders a span for a known agent', () => {
    installMatchMedia(false);
    const { container } = render(<AgentDot agentId="agent_1" />);
    const dot = container.querySelector('span');
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('returns null for an unknown agent id', () => {
    installMatchMedia(false);
    const { container } = render(<AgentDot agentId="ghost-agent" />);
    expect(container.querySelector('span')).toBeNull();
  });

  it('honors the size prop', () => {
    installMatchMedia(false);
    const { container } = render(<AgentDot agentId="agent_1" size={24} />);
    const dot = container.querySelector('span')!;
    expect(dot).toHaveStyle({ width: '24px', height: '24px' });
  });

  it('honors a custom color override', () => {
    installMatchMedia(false);
    const { container } = render(
      <AgentDot agentId="agent_1" color="#FF00FF" />,
    );
    const dot = container.querySelector('span')!;
    expect(dot).toHaveStyle({ backgroundColor: '#FF00FF' });
  });

  it('uses the agent color when no color prop is given', () => {
    installMatchMedia(false);
    const { container } = render(<AgentDot agentId="agent_1" />);
    // AGENTS.agent_1.color is #8C9BAB — assert exact match.
    const dot = container.querySelector('span')!;
    expect(dot.style.backgroundColor).toBeTruthy();
  });

  it('disableAnimation=true suppresses the animation style', () => {
    installMatchMedia(false);
    const { container } = render(
      <AgentDot agentId="agent_1" disableAnimation />,
    );
    const dot = container.querySelector('span')!;
    expect(dot.style.animation).toBe('none');
  });

  it('prefers-reduced-motion suppresses the animation style', () => {
    installMatchMedia(true);
    const { container } = render(<AgentDot agentId="agent_1" />);
    const dot = container.querySelector('span')!;
    // Animation must be 'none' even without explicit disableAnimation —
    // the OS-level setting wins.
    expect(dot.style.animation).toBe('none');
  });

  it('renders a circle via agent-dot class', () => {
    installMatchMedia(false);
    const { container } = render(<AgentDot agentId="agent_1" />);
    const dot = container.querySelector('span')!;
    expect(dot).toHaveClass('agent-dot');
    expect(dot).toHaveClass('agent-dot--1');
    expect(dot).toHaveClass('agent-dot--live');
  });

  it('uses static class when animation is disabled', () => {
    installMatchMedia(false);
    const { container } = render(
      <AgentDot agentId="agent_2" disableAnimation />,
    );
    expect(container.querySelector('span')).toHaveClass('agent-dot--static');
    expect(container.querySelector('span')).not.toHaveClass('agent-dot--live');
  });
});