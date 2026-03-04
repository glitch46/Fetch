// Text sanitization utility — owned by Mobile Agent
// Strips smart quotes, em dashes, and garbled UTF-8 sequences from API text

export function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\uFFFD/g, '')
    .replace(/\u00E2[\u0080-\u00BF][\u0080-\u00BF]/g, '');
}
