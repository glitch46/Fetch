// Text sanitization utility — owned by Mobile Agent
// Decodes HTML entities, strips tags, smart quotes, em dashes,
// and garbled UTF-8 sequences from API text

export function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    // Strip residual HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Decode named HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, '-')
    .replace(/&ndash;/gi, '-')
    .replace(/&hellip;/gi, '...')
    .replace(/&bull;/gi, '•')
    // Decode numeric decimal entities (&#39; &#160; etc.)
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number(dec)))
    // Decode numeric hex entities (&#x27; &#xA0; etc.)
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Smart quotes → straight quotes
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    // Em dash / en dash → regular hyphen
    .replace(/[\u2013\u2014]/g, '-')
    // Ellipsis → three dots
    .replace(/\u2026/g, '...')
    // Non-breaking space → regular space
    .replace(/\u00A0/g, ' ')
    // Remove replacement characters
    .replace(/\uFFFD/g, '')
    // Remove garbled multi-byte sequences
    .replace(/\u00E2[\u0080-\u00BF][\u0080-\u00BF]/g, '')
    // Collapse multiple spaces into one
    .replace(/  +/g, ' ')
    .trim();
}
