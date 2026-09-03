/**
 * Generated placeholder cover art for Tracks that have no artwork yet. Achromatic
 * by design (DESIGN.md §8): a charcoal tile whose shade is derived from the title,
 * with the title's first letter set large in silver.
 */
export function placeholderCoverSvg(title: string): string {
  const initial = escapeXml((title.trim()[0] ?? '?').toUpperCase())
  // Spread titles across a handful of charcoal shades so a grid of placeholders
  // is not a single flat block.
  const shades = ['#1f1f1f', '#252525', '#272727', '#2e2e2e', '#333333']
  const shade = shades[hash(title) % shades.length]
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
    `<rect width="512" height="512" fill="${shade}"/>`,
    '<text x="256" y="256" fill="#b3b3b3" font-family="Figtree, Helvetica Neue, Helvetica, Arial, sans-serif"',
    ` font-size="288" font-weight="700" text-anchor="middle" dominant-baseline="central">${initial}</text>`,
    '</svg>',
    '',
  ].join('\n')
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
