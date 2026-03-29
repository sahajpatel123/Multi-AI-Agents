import { useId } from 'react';

export function NotionIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-1.026-.7-2.242-.606L3.16 2.295c-.467.046-.56.28-.374.466z"
        fill="#000"
      />
      <path
        d="M5.11 6.957v13.516c0 .747.373 1.027 1.213.98l14.523-.84c.84-.046.934-.56.934-1.167V5.97c0-.607-.233-.933-.747-.887l-15.177.887c-.56.047-.746.327-.746.987z"
        fill="#000"
        fillOpacity={0.06}
      />
      <path
        d="M14.497 7.8l-4.46.28c-.187.014-.234.14-.234.28v.793c0 .14.047.28.28.373l3.34 2.008v5.626c.42-.047.887-.327.887-.84V8.64c0-.56-.373-.887-.813-.84z"
        fill="#000"
      />
      <path
        d="M5.39 8.174l-.047 10.48c0 .56.327.747.84.7l12.936-.793c.513-.047.56-.374.56-.747V8.08l-14.29.094z"
        fill="#000"
        fillOpacity={0.04}
      />
    </svg>
  );
}

export function GoogleDriveIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M6.28 19.78L1.5 11.5l4.5-7.78h9l4.5 7.78-4.5 7.78z" fill="none" />
      <path d="M4.5 15l-3 5.196h7l3-5.196z" fill="#0066DA" />
      <path d="M12 4L8.5 9.804h7L19 4z" fill="#00AC47" />
      <path d="M19.5 15H8.5l-2 3.464H17.5z" fill="#EA4335" />
      <path d="M12 4l3.5 5.804L19 4z" fill="#00832D" />
      <path d="M4.5 15l4-6.196H4L.5 15z" fill="#2684FC" />
      <path d="M19.5 15l-4-6.196L19 4l4 6.804z" fill="#FFBA00" />
    </svg>
  );
}

export function GmailIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
        fill="#EA4335"
      />
      <path d="M20 4l-8 7L4 4" stroke="white" strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M2 6l8 7 2-1.5L20 6" fill="#EA4335" />
      <path d="M2 6v12h20V6L12 13 2 6z" fill="white" fillOpacity={0.1} />
    </svg>
  );
}

export function GoogleCalendarIcon({ size = 24 }: { size?: number }) {
  const day = new Date().getDate();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" fill="white" stroke="#E0E0E0" />
      <rect x="3" y="4" width="18" height="5" fill="#1A73E8" />
      <circle cx="8" cy="3" r="1.5" fill="#1A73E8" />
      <circle cx="16" cy="3" r="1.5" fill="#1A73E8" />
      <text x="12" y="17" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#1A73E8">
        {day}
      </text>
    </svg>
  );
}

export function GitHubIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#24292F" aria-hidden>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function LinearIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M3.5 13.5L10.5 20.5L20.5 10.5L13.5 3.5L3.5 13.5Z" fill="#5E6AD2" />
      <path
        d="M3 17L7 21M13 3L17 7"
        stroke="#5E6AD2"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SlackIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M6 15a2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2h2v2z" fill="#E01E5A" />
      <path
        d="M7 15a2 2 0 012-2 2 2 0 012 2v5a2 2 0 01-2 2 2 2 0 01-2-2v-5z"
        fill="#E01E5A"
      />
      <path d="M9 6a2 2 0 01-2-2 2 2 0 012-2 2 2 0 012 2v2H9z" fill="#36C5F0" />
      <path d="M9 7a2 2 0 012 2 2 2 0 01-2 2H4a2 2 0 01-2-2 2 2 0 012-2h5z" fill="#36C5F0" />
      <path d="M18 9a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2V9h2z" fill="#2EB67D" />
      <path d="M17 9a2 2 0 01-2-2 2 2 0 012-2h5a2 2 0 012 2 2 2 0 01-2 2h-5z" fill="#2EB67D" />
      <path d="M15 18a2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2h2v2z" fill="#ECB22E" />
      <path d="M15 17a2 2 0 01-2-2 2 2 0 012-2h5a2 2 0 012 2 2 2 0 01-2 2h-5z" fill="#ECB22E" />
    </svg>
  );
}

export function AirtableIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="2" width="9" height="9" rx="1.5" fill="#FCB400" />
      <rect x="13" y="2" width="9" height="9" rx="1.5" fill="#18BFFF" />
      <rect x="2" y="13" width="9" height="9" rx="1.5" fill="#F82B60" />
      <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#20C933" />
    </svg>
  );
}

export function DropboxIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#0061FF" aria-hidden>
      <path d="M6 2L1 5.5 6 9l5-3.5L6 2z" />
      <path d="M16 2l-5 3.5 5 3.5 5-3.5L16 2z" />
      <path d="M1 12.5L6 16l5-3.5-5-3.5-5 3.5z" />
      <path d="M11 12.5l5 3.5 5-3.5-5-3.5-5 3.5z" />
      <path d="M6 17.5l5 3 5-3-5-3-5 3z" />
    </svg>
  );
}

export function JiraIcon({ size = 24 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  const ga = `jira-a-${uid}`;
  const gb = `jira-b-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.004-1.005z"
        fill="#2684FF"
      />
      <path
        d="M6.174 6.174H.022a5.215 5.215 0 005.215 5.215h2.13V9.33A5.215 5.215 0 0012.58 14.55V7.18a1.005 1.005 0 00-1.005-1.005H6.174z"
        fill={`url(#${gb})`}
      />
      <path
        d="M0.622 0H6.17a5.215 5.215 0 015.215 5.215v5.154a1.005 1.005 0 01-1.005 1.005H6.174A5.215 5.215 0 011.627 6.174V1.005A1.005 1.005 0 01.622 0z"
        fill={`url(#${ga})`}
      />
      <defs>
        <linearGradient id={ga} x1="6.17" y1="5.678" x2="2.99" y2="8.858" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0052CC" />
          <stop offset="1" stopColor="#2684FF" />
        </linearGradient>
        <linearGradient id={gb} x1="12.69" y1="10.418" x2="9.51" y2="13.598" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0052CC" />
          <stop offset="1" stopColor="#2684FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ConfluenceIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M2.07 17.2c-.35.57-.05 1.28.56 1.54l4.45 1.81c.48.2 1.02-.02 1.28-.56 2.02-3.63 4.38-5.43 8.38-5.43 3.13 0 5.66 1.15 7.69 2.68l4.4-3.63c-3.13-2.58-7.13-4.26-12.07-4.26-6.92 0-11.72 3.68-14.69 7.85z"
        fill="#0052CC"
      />
      <path
        d="M21.93 6.8c.35-.57.05-1.28-.56-1.54l-4.45-1.81c-.48-.2-1.02.02-1.28.56-2.02 3.63-4.38 5.43-8.38 5.43-3.13 0-5.66-1.15-7.69-2.68L.47 10.38c3.13 2.58 7.13 4.26 12.07 4.26 6.92 0 11.72-3.68 14.79-7.84z"
        fill="#2684FF"
      />
    </svg>
  );
}

export function HubSpotIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="18" cy="6" r="3" fill="#FF7A59" />
      <path
        d="M13.5 6A4.5 4.5 0 009 10.5v1A4.5 4.5 0 0013.5 16h1A4.5 4.5 0 0019 11.5v-1A1.5 1.5 0 0018 9V6.5A1.5 1.5 0 0016.5 5h-1.5A1.5 1.5 0 0013.5 6.5V6z"
        fill="#FF7A59"
      />
      <path
        d="M9 15.5A4.5 4.5 0 014.5 20h-.75a.75.75 0 010-1.5H4.5a3 3 0 000-6h-.75a.75.75 0 010-1.5H4.5A4.5 4.5 0 019 15.5z"
        fill="#FF7A59"
      />
    </svg>
  );
}

export function PlugIcon({ size = 20, color = '#D4C4B0' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22v-4M9 8V6a3 3 0 116 0v2M5 12H3a2 2 0 00-2 2v3a2 2 0 002 2h2l3.5-2.5V9.5M19 12h2a2 2 0 012 2v3a2 2 0 01-2 2h-2l-3.5-2.5V9.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function getBrandIcon(serviceId: string, size = 28) {
  switch (serviceId) {
    case 'notion':
      return <NotionIcon size={size} />;
    case 'google_drive':
      return <GoogleDriveIcon size={size} />;
    case 'gmail':
      return <GmailIcon size={size} />;
    case 'google_calendar':
      return <GoogleCalendarIcon size={size} />;
    case 'github':
      return <GitHubIcon size={size} />;
    case 'linear':
      return <LinearIcon size={size} />;
    case 'slack':
      return <SlackIcon size={size} />;
    case 'airtable':
      return <AirtableIcon size={size} />;
    case 'dropbox':
      return <DropboxIcon size={size} />;
    case 'jira':
      return <JiraIcon size={size} />;
    case 'confluence':
      return <ConfluenceIcon size={size} />;
    case 'hubspot':
      return <HubSpotIcon size={size} />;
    default:
      return null;
  }
}