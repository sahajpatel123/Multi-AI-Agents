import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  getBrandIcon,
  NotionIcon,
  GoogleDriveIcon,
  GmailIcon,
  GoogleCalendarIcon,
  GitHubIcon,
  LinearIcon,
  SlackIcon,
  AirtableIcon,
  DropboxIcon,
  JiraIcon,
  ConfluenceIcon,
  HubSpotIcon,
} from './BrandIcons';

describe('BrandIcons (individual)', () => {
  it('renders each icon as an SVG', () => {
    const icons = [
      NotionIcon,
      GoogleDriveIcon,
      GmailIcon,
      GoogleCalendarIcon,
      GitHubIcon,
      LinearIcon,
      SlackIcon,
      AirtableIcon,
      DropboxIcon,
      JiraIcon,
      ConfluenceIcon,
      HubSpotIcon,
    ];
    for (const Icon of icons) {
      const { container } = render(<Icon />);
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('honors a custom size prop', () => {
    const { container } = render(<NotionIcon size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('icons are aria-hidden so screen readers do not read decorative SVG paths', () => {
    const { container } = render(<NotionIcon />);
    // Every icon in this module sets aria-hidden on its <svg>.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden');
  });
});

describe('getBrandIcon', () => {
  it('returns the right component for each known service', () => {
    // Each service_id should render an SVG element when looked up.
    const services = [
      'notion',
      'google_drive',
      'gmail',
      'google_calendar',
      'github',
      'linear',
      'slack',
      'airtable',
      'dropbox',
      'jira',
      'confluence',
      'hubspot',
    ];
    for (const service of services) {
      const { container } = render(<>{getBrandIcon(service)}</>);
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('honors a custom size via the size prop', () => {
    const { container } = render(<>{getBrandIcon('github', 64)}</>);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });

  it('returns null for unknown service ids (no crash, no fallback)', () => {
    const { container } = render(<>{getBrandIcon('unknown-service')}</>);
    // No SVG should render — the caller is responsible for a fallback
    // (otherwise the UI would silently render nothing for an unknown
    // service).
    expect(container.querySelector('svg')).toBeNull();
  });
});