import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import policy from '../scripts/csp-policy.json';

describe('index.html', () => {
  it('declares exactly the expected Content-Security-Policy', () => {
    const match = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
    expect(match).not.toBeNull();
    const directives = (match?.[1] ?? '')
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);
    expect(directives).toEqual(policy.directives);
  });

  it('has no inline scripts, styles or event handlers', () => {
    for (const tag of html.matchAll(/<script\b[^>]*>/gi)) expect(tag[0]).toMatch(/\bsrc=/);
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('policy forbids network, inline code and foreign origins', () => {
    expect(policy.directives).toContain("connect-src 'none'");
    expect(policy.directives).toContain("default-src 'none'");
    expect(policy.directives.join(' ')).not.toMatch(/unsafe-|\*|https?:/);
  });
});
