/*
  Generate a colorful SVG banner from src/utils/banner.ts ALPH_BANNER
  Usage: node scripts/generate-banner-svg.js
*/

const fs = require('fs');
const path = require('path');

function extractAlphBanner(tsPath) {
  const content = fs.readFileSync(tsPath, 'utf8');
  const match = content.match(/export const ALPH_BANNER = `([\s\S]*?)`;?/);
  if (!match) throw new Error('Could not find ALPH_BANNER in banner.ts');
  const raw = match[1]
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  return raw;
}

function buildSvg(lines) {
  const padding = { top: 24, right: 24, bottom: 24, left: 24 };
  const lineHeight = 22; // px
  const charWidth = 11; // px (monospace approx)
  const fontSize = 16; // px
  const fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const width = padding.left + maxLineLen * charWidth + padding.right;
  const height = padding.top + lines.length * lineHeight + padding.bottom;

  const bgColor = '#0d1117'; // GitHub dark canvas
  const colors = ['#ff4d4f', '#FFA500']; // red, orange alternating

  let y = padding.top + lineHeight - 4; // baseline adjust

  // escape helpers
  const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => s.replace(/"/g, '&quot;');

  const textEls = lines
    .map((line, i) => {
      const fill = colors[i % 2];
      const safe = escText(line);
      const x = padding.left;
      const tspan = `<text x="${x}" y="${y}" fill="${fill}" font-family="${escAttr(fontFamily)}" font-size="${fontSize}" xml:space="preserve">${safe}</text>`;
      y += lineHeight;
      return tspan;
    })
    .join('\n    ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs/>
  <rect x="0" y="0" width="100%" height="100%" fill="${bgColor}" rx="8" ry="8" />
  ${textEls}
</svg>`;
  return svg;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const bannerTs = path.join(repoRoot, 'src', 'utils', 'banner.ts');
  const outDir = path.join(repoRoot, 'assets');
  const outFile = path.join(outDir, 'alph-banner.svg');

  const lines = extractAlphBanner(bannerTs);
  const svg = buildSvg(lines);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, svg, 'utf8');
  console.log(`Generated ${path.relative(repoRoot, outFile)} (${svg.length} bytes)`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
