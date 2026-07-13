export type IntegrationServiceDef = {
  id: string;
  name: string;
  description: string;
  brand_color: string;
  bg_color: string;
  how_to: string;
  placeholder: string;
};

/** Catalog for Integrations tab (MCP manual connect). */
export const SERVICES: IntegrationServiceDef[] = [
  {
    id: 'notion',
    name: 'Notion',
    description: 'Internal docs and databases',
    brand_color: '#000000',
    bg_color: '#F7F6F3',
    how_to:
      'Go to notion.so/my-integrations → Create integration → Copy the internal integration token',
    placeholder: 'secret_xxxxxxxxxxxxxxxx...',
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    description: 'Files and Google Docs',
    brand_color: '#4285F4',
    bg_color: '#EAF1FB',
    how_to:
      'Google Cloud Console → APIs & Services → OAuth 2.0 → create credentials and copy access token with Drive scope',
    placeholder: 'ya29.xxxxxxxxxxxxxxxx...',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Emails and threads',
    brand_color: '#EA4335',
    bg_color: '#FEF0EE',
    how_to:
      'Google Cloud Console → Enable Gmail API → OAuth 2.0 → copy access token with Gmail readonly scope',
    placeholder: 'ya29.xxxxxxxxxxxxxxxx...',
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Events and scheduling context',
    brand_color: '#1A73E8',
    bg_color: '#EAF1FB',
    how_to:
      'Google Cloud Console → Enable Calendar API → OAuth 2.0 → copy access token with Calendar readonly scope',
    placeholder: 'ya29.xxxxxxxxxxxxxxxx...',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories and code',
    brand_color: '#24292F',
    bg_color: '#F6F8FA',
    how_to:
      'github.com/settings/tokens → Generate new token (classic) → select repo read scope → copy token',
    placeholder: 'ghp_xxxxxxxxxxxxxxxx...',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issues and project tracking',
    brand_color: '#5E6AD2',
    bg_color: '#EEEDFE',
    how_to: 'linear.app/settings/api → Personal API keys → Create key → copy',
    placeholder: 'lin_api_xxxxxxxxxxxxxxxx...',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Messages and channels',
    brand_color: '#4A154B',
    bg_color: '#F6EFF6',
    how_to:
      'api.slack.com/apps → Create app → OAuth & Permissions → add channels:read and channels:history scopes → Install to workspace → copy Bot User OAuth Token',
    placeholder: 'xoxb-xxxxxxxxxxxxxxxx...',
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Tables and databases',
    brand_color: '#FCB400',
    bg_color: '#FFF9E6',
    how_to: 'airtable.com/account → API section → Generate API key → copy',
    placeholder: 'keyxxxxxxxxxxxxxxxx...',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Files and folders',
    brand_color: '#0061FF',
    bg_color: '#EAF1FF',
    how_to: 'dropbox.com/developers/apps → Create app → Generate access token → copy',
    placeholder: 'sl.xxxxxxxxxxxxxxxx...',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Tickets and sprints',
    brand_color: '#0052CC',
    bg_color: '#EAF0FF',
    how_to: 'id.atlassian.com/manage-profile/security/api-tokens → Create API token → copy',
    placeholder: 'ATATT3xxxxxxxATxxxxxxxxx...',
  },
  {
    id: 'confluence',
    name: 'Confluence',
    description: 'Team wikis and docs',
    brand_color: '#0052CC',
    bg_color: '#EAF0FF',
    how_to:
      'id.atlassian.com/manage-profile/security/api-tokens → Create API token → copy (same token as Jira)',
    placeholder: 'ATATT3xxxxxxxATxxxxxxxxx...',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'CRM contacts and deals',
    brand_color: '#FF7A59',
    bg_color: '#FFF2EE',
    how_to:
      'app.hubspot.com → Settings → Integrations → Private Apps → Create private app → copy access token',
    placeholder: 'pat-na1-xxxxxxxxxxxxxxxx...',
  },
];

export function getServiceById(id: string): IntegrationServiceDef | undefined {
  return SERVICES.find((s) => s.id === id);
}
