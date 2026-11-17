// Checks that every local image and Markdown link in the documentation exists.
// Usage: node scripts/check-doc-links.mjs [files...]  (defaults to README.md and docs/*.md)
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['README.md', 'mobile/README.md', ...fs.readdirSync('docs').filter(f => f.endsWith('.md')).map(f => path.join('docs', f))];
const pattern = /!?\[[^\]]*\]\(([^)\s]+)[^)]*\)|<img[^>]+src="([^"]+)"/g;
let missing = 0, checked = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(pattern)) {
    const target = (match[1] ?? match[2]).split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue; // external links and anchors
    checked++;
    const resolved = path.join(path.dirname(file), decodeURIComponent(target));
    if (!fs.existsSync(resolved)) { missing++; console.error(`${file}: missing ${target}`); }
  }
}
console.log(`${checked} local links checked, ${missing} missing`);
process.exit(missing ? 1 : 0);
