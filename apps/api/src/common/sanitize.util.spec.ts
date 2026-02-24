import { stripHtml } from './sanitize.util';

describe('stripHtml', () => {
  it('strips basic script tags (XSS)', () => {
    expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('strips inline event handlers', () => {
    expect(stripHtml('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('strips bold/italic HTML', () => {
    expect(stripHtml('<b>hello</b> <i>world</i>')).toBe('hello world');
  });

  it('decodes then strips HTML-encoded script tags', () => {
    expect(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('alert(1)');
  });

  it('leaves plain text untouched', () => {
    expect(stripHtml('Hello, world! 🎉')).toBe('Hello, world! 🎉');
  });

  it('leaves emojis untouched', () => {
    expect(stripHtml('👍🔥💯')).toBe('👍🔥💯');
  });

  it('returns non-string values unchanged', () => {
    expect(stripHtml(42 as unknown as string)).toBe(42);
    expect(stripHtml(null as unknown as string)).toBe(null);
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  it('strips nested tags', () => {
    expect(stripHtml('<div><p>Hello</p></div>')).toBe('Hello');
  });

  it('strips self-closing tags', () => {
    expect(stripHtml('Line1<br/>Line2')).toBe('Line1Line2');
  });
});
