import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TemplatesModal } from './TemplatesModal';
import type { AgentTaskTemplate } from '../api';
import { loadFavoriteTemplateIds } from '../lib/templatesFavorites';
import { loadRecentTemplateIds } from '../lib/templatesRecent';
import { TEMPLATES_VIEW_STATE_KEY } from '../lib/templatesViewState';

function template(overrides: Partial<AgentTaskTemplate> = {}): AgentTaskTemplate {
  return {
    id: 'tpl',
    category: 'Business',
    title: 'Template',
    icon: 'briefcase',
    description: 'A template',
    prompt_template: 'Research {{topic}}',
    slots: ['one', 'two'],
    default_expertise: 'mid',
    example: 'Example',
    ...overrides,
  };
}

const alpha = template({ id: 'alpha', title: 'Alpha brief', description: 'Alpha deep-dive' });
const beta = template({ id: 'beta', title: 'Beta memo', description: 'Beta brief' });
const gamma = template({
  id: 'gamma',
  category: 'Research',
  title: 'Gamma review',
  description: 'Gamma literature review',
});

const categories: Record<string, AgentTaskTemplate[]> = {
  Business: [alpha, beta],
  Research: [gamma],
};

function renderModal(overrides: Partial<React.ComponentProps<typeof TemplatesModal>> = {}) {
  return render(
    <TemplatesModal
      open
      closing={false}
      categories={categories}
      onClose={vi.fn()}
      onSelect={vi.fn()}
      {...overrides}
    />,
  );
}

describe('TemplatesModal favorites', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when closed', () => {
    const { container } = renderModal({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('hides the Favorites tab until something is starred', () => {
    renderModal();
    expect(screen.queryByRole('tab', { name: 'Favorites' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Alpha brief')).toBeInTheDocument();
  });

  it('stars a template, persists it, and filters the Favorites tab', () => {
    renderModal();
    const starAlpha = screen.getByRole('button', { name: 'Favorite template Alpha brief' });
    expect(starAlpha).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(starAlpha);

    expect(starAlpha).toHaveAttribute('aria-pressed', 'true');
    expect(loadFavoriteTemplateIds()).toEqual(['alpha']);

    fireEvent.click(screen.getByRole('tab', { name: 'Favorites' }));
    expect(screen.getByText('Alpha brief')).toBeInTheDocument();
    expect(screen.queryByText('Beta memo')).toBeNull();
    expect(screen.queryByText('Gamma review')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
  });

  it('orders the Favorites tab most-recently-starred first', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Favorite template Beta memo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Favorite template Alpha brief' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Favorites' }));

    const grid = document.querySelector('.templates-modal__grid');
    expect(grid).not.toBeNull();
    const titles = Array.from(grid!.querySelectorAll('.templates-card__title')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['Alpha brief', 'Beta memo']);
  });

  it('unstars from the Favorites tab and clears all', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Favorite template Alpha brief' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Favorites' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remove template Alpha brief' }));
    expect(screen.getByText('No favorites yet')).toBeInTheDocument();
    expect(loadFavoriteTemplateIds()).toEqual([]);

    const browse = screen.getByRole('button', { name: 'Browse all templates' });
    fireEvent.click(browse);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Beta memo')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Favorites' })).toBeNull();
  });

  it('keeps favorites across modal reopens', () => {
    const { unmount } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Favorite template Alpha brief' }));
    unmount();

    renderModal();
    expect(screen.getByRole('tab', { name: 'Favorites' })).toBeInTheDocument();
    const starAlpha = screen.getByRole('button', { name: 'Remove template Alpha brief' });
    expect(starAlpha).toHaveAttribute('aria-pressed', 'true');
  });

  it('prunes stale favorites that left the catalog', () => {
    window.localStorage.setItem(
      'arena_agent_templates_favorites_v1',
      JSON.stringify(['alpha', 'vanished']),
    );
    renderModal();

    expect(loadFavoriteTemplateIds()).toEqual(['alpha']);
    fireEvent.click(screen.getByRole('tab', { name: 'Favorites' }));
    expect(screen.getByText('Alpha brief')).toBeInTheDocument();
    expect(screen.queryByText('Vanished')).toBeNull();
  });

  it('hides the Favorites tab when every stored favorite is stale', () => {
    window.localStorage.setItem(
      'arena_agent_templates_favorites_v1',
      JSON.stringify(['vanished']),
    );
    renderModal();

    expect(loadFavoriteTemplateIds()).toEqual([]);
    expect(screen.queryByRole('tab', { name: 'Favorites' })).toBeNull();
  });

  it('selecting a template records recent use and closes', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSelect, onClose });

    const card = screen.getByText('Alpha brief').closest('.templates-card');
    const select = within(card as HTMLElement).getByRole('button', {
      name: /Business Alpha brief/i,
    });
    fireEvent.click(select);

    expect(onSelect).toHaveBeenCalledWith(alpha);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(loadRecentTemplateIds()).toContain('alpha');
  });

  it('restores the last tab and search query on reopen', () => {
    const { unmount } = renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Research' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search task templates' }), {
      target: { value: 'Gamma' },
    });
    unmount();

    renderModal();
    expect(screen.getByRole('tab', { name: 'Research' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('searchbox', { name: 'Search task templates' }),
    ).toHaveValue('Gamma');
    const grid = document.querySelector('.templates-modal__grid');
    expect(grid?.textContent).toContain('Gamma review');
    expect(grid?.textContent).not.toContain('Alpha brief');
  });

  it('restores the sort and availability filter on reopen', () => {
    const mixedCategories: Record<string, AgentTaskTemplate[]> = {
      Business: [alpha, { ...beta, disabled: true }],
      Research: [gamma],
    };
    const { unmount } = renderModal({ categories: mixedCategories });
    fireEvent.click(screen.getByRole('tab', { name: 'Business' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort templates' }), {
      target: { value: 'title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    unmount();

    renderModal({ categories: mixedCategories });
    expect(
      screen.getByRole('combobox', { name: 'Sort templates' }),
    ).toHaveValue('title');
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('falls back to All when a saved Favorites tab has no favorites', () => {
    window.localStorage.setItem(
      TEMPLATES_VIEW_STATE_KEY,
      JSON.stringify({
        tab: 'Favorites',
        search: '',
        sort: 'default',
        availability: 'all',
        expertise: 'all',
      }),
    );

    renderModal();
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keeps in-progress edits when the catalog finishes loading', () => {
    const { rerender } = renderModal({ loading: true, categories: {} });
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search task templates' }),
      { target: { value: 'Gamma' } },
    );

    rerender(
      <TemplatesModal
        open
        closing={false}
        categories={categories}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('searchbox', { name: 'Search task templates' }),
    ).toHaveValue('Gamma');
    const grid = document.querySelector('.templates-modal__grid');
    expect(grid?.textContent).toContain('Gamma review');
    expect(grid?.textContent).not.toContain('Alpha brief');
  });

  it('applies a saved expertise filter once the catalog finishes loading', () => {
    window.localStorage.setItem(
      TEMPLATES_VIEW_STATE_KEY,
      JSON.stringify({
        tab: 'All',
        search: '',
        sort: 'default',
        availability: 'all',
        expertise: 'expert',
      }),
    );
    const { rerender } = renderModal({ loading: true, categories: {} });

    rerender(
      <TemplatesModal
        open
        closing={false}
        categories={{ Business: [alpha, { ...beta, default_expertise: 'expert' }] }}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Expert' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
