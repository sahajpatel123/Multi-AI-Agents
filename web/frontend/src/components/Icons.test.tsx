import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Icons } from './Icons';

describe('Icons', () => {
  it('exports a complete set of icon components', () => {
    // Lock down the public contract — adding a new icon should be a
    // deliberate test addition, not a silent rename.
    const expected = [
      'arrowRight',
      'plus',
      'copy',
      'download',
      'refresh',
      'bell',
      'users',
      'lightning',
      'star',
      'logout',
      'plug',
      'grid',
      'layers',
      'sparkle',
      'flame',
    ];
    for (const name of expected) {
      expect(Icons).toHaveProperty(name);
    }
    expect(Object.keys(Icons).length).toBe(expected.length);
  });

  it('every icon renders an SVG', () => {
    for (const [name, Icon] of Object.entries(Icons)) {
      const { container } = render(<>{Icon()}</>);
      const svg = container.querySelector('svg');
      expect(svg, `icon ${name} did not render an SVG`).not.toBeNull();
    }
  });

  it('every icon is aria-hidden (decorative by default)', () => {
    for (const [name, Icon] of Object.entries(Icons)) {
      const { container } = render(<>{Icon()}</>);
      const svg = container.querySelector('svg')!;
      expect(svg, `icon ${name} should be aria-hidden`).toHaveAttribute('aria-hidden');
    }
  });

  it('honors a custom size prop', () => {
    const { container } = render(<>{Icons.arrowRight(32)}</>);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
  });

  it('defaults to 16px when no size is given', () => {
    const { container } = render(<>{Icons.plus()}</>);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
  });
});