import { describe, expect, it } from 'vitest';
import { formatAgentReportEndnote } from './agentReportEndnote';

describe('formatAgentReportEndnote', () => {
  it('emits a portable EndNote record with public provenance only', () => {
    expect(
      formatAgentReportEndnote({
        title: 'Research & brief',
        question: 'What should we verify first?',
        url: 'https://arena.example/share/agent/public-token',
        sharedAt: '2026-08-14T11:00:00Z',
      }),
    ).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE xml>\n' +
        '<xml>\n' +
        '  <records>\n' +
        '    <record>\n' +
        '      <rec-number>1</rec-number>\n' +
        '      <ref-type name="Web Page">12</ref-type>\n' +
        '      <contributors>\n' +
        '        <authors>\n' +
        '          <author>\n' +
        '            <last>Arena</last>\n' +
        '          </author>\n' +
        '        </authors>\n' +
        '      </contributors>\n' +
        '      <titles>\n' +
        '        <title>Research &amp; brief</title>\n' +
        '        <secondary-title>Arena Agent report</secondary-title>\n' +
        '      </titles>\n' +
        '      <dates>\n' +
        '        <year>2026</year>\n' +
        '        <pub-dates>\n' +
        '          <date>2026-08-14</date>\n' +
        '        </pub-dates>\n' +
        '      </dates>\n' +
        '      <publisher>\n' +
        '        <publisher-name>Arena</publisher-name>\n' +
        '      </publisher>\n' +
        '      <urls>\n' +
        '        <related-urls>\n' +
        '          <url>https://arena.example/share/agent/public-token</url>\n' +
        '        </related-urls>\n' +
        '      </urls>\n' +
        '      <notes>\n' +
        '        <note>Arena Agent report. Question: What should we verify first?</note>\n' +
        '      </notes>\n' +
        '    </record>\n' +
        '  </records>\n' +
        '</xml>\n',
    );
  });

  it('escapes hostile metadata and omits unsafe URLs', () => {
    const xml = formatAgentReportEndnote({
      title: 'A <report>\nwith a second line',
      question: 'Can this & that\r\nadd a fake tag?',
      url: 'javascript:alert(1)',
    });

    expect(xml).toContain('<title>A &lt;report&gt; with a second line</title>');
    expect(xml).toContain(
      '<note>Arena Agent report. Question: Can this &amp; that add a fake tag?</note>',
    );
    expect(xml).not.toContain('javascript:');
    expect(xml).not.toContain('<fake>');
    expect(xml).not.toContain('second line\n');
  });

  it('strips tracking state, rejects credentials, and omits malformed dates', () => {
    const stable = formatAgentReportEndnote({
      title: 'Stable URL',
      url: 'https://user:secret@arena.example/share/agent/public-token?utm_source=copy#draft',
      sharedAt: '2026-02-30T11:00:00Z',
    });
    expect(stable).not.toContain('secret');
    expect(stable).not.toContain('<url>');
    expect(stable).not.toContain('<year>');
    expect(stable).not.toContain('utm_source');

    const sanitized = formatAgentReportEndnote({
      title: 'Tracked URL',
      url: 'https://arena.example/share/agent/public-token?utm_source=copy#draft',
      sharedAt: '2026-08-14T11:00:00Z',
    });
    expect(sanitized).toContain(
      '<url>https://arena.example/share/agent/public-token</url>',
    );
    expect(sanitized).not.toContain('utm_source');
    expect(sanitized).not.toContain('#draft');
  });

  it.each([
    '2026-02-28-draft',
    '2026-02-28T25:00:00Z',
    '2026-02-28T11:00:00Z trailing',
  ])('omits malformed shared timestamps: %s', (sharedAt) => {
    const xml = formatAgentReportEndnote({ title: 'A report', sharedAt });
    expect(xml).not.toContain('<year>');
    expect(xml).not.toContain('<pub-dates>');
  });
});
