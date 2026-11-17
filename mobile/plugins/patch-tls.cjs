const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function applyExactPatch(root, patch) {
  // Strict, context-checked hunks; avoids depending on a host `patch` executable.
  for (const section of patch.split(/^--- a\//m).slice(1)) {
    const lines = section.split('\n');
    const file = lines.shift();
    if (lines.shift() !== '+++ b/' + file) throw new Error('Invalid TLS patch path');
    let source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const hunk of lines
      .join('\n')
      .split(/^@@[^\n]*\n/m)
      .slice(1)) {
      const content = hunk.split('\n').filter(line => /^[ +\-]/.test(line));
      const before = content
        .filter(line => line[0] !== '+')
        .map(line => line.slice(1))
        .join('\n');
      const after = content
        .filter(line => line[0] !== '-')
        .map(line => line.slice(1))
        .join('\n');
      const index = source.indexOf(before);
      if (!before || index < 0 || source.lastIndexOf(before) !== index)
        throw new Error('TLS patch context mismatch: ' + file);
      source = source.slice(0, index) + after + source.slice(index + before.length);
    }
    fs.writeFileSync(path.join(root, file), source);
  }
}

function patchTls() {
  const root = path.dirname(require.resolve('react-native-tcp-socket/package.json'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== '6.4.3') throw new Error('Review the WASAP TLS patch before upgrading react-native-tcp-socket');
  const checks = require('../patches/tls-checksums.json');
  const hash = file =>
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, file)))
      .digest('hex');
  if (checks.every(check => hash(check.file) === check.patched)) return;
  if (!checks.every(check => hash(check.file) === check.original))
    throw new Error('Unexpected native TLS source; refusing a partially applied or outdated patch');
  applyExactPatch(
    root,
    fs.readFileSync(path.join(__dirname, '../patches/react-native-tcp-socket+6.4.3.patch'), 'utf8'),
  );
  if (!checks.every(check => hash(check.file) === check.patched))
    throw new Error('Native TLS patch verification failed');
}

module.exports = patchTls;
if (require.main === module) patchTls();
