// Renders each slide as an MP4 clip plus a PNG of its final (resting) frame.
// Usage: node scripts/render.mjs stills | all
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';

const mode = process.argv[2] ?? 'all';
const ids = ['S1-Portada', 'S2-Alcance', 'S3-Arquitectura', 'S4-Trama', 'S5-Garantias', 'S6-Estado', 'S7-Problemas', 'S8-Siguientes'];
const last = 209;
mkdirSync('out/stills', {recursive: true});
mkdirSync('out/clips', {recursive: true});
const run = (...args) => execFileSync('npx', ['remotion', ...args], {stdio: 'inherit'});

for (const id of ids) {
	run('still', 'src/index.ts', id, `out/stills/${id}.png`, `--frame=${last}`);
	if (mode === 'all') run('render', 'src/index.ts', id, `out/clips/${id}.mp4`);
}
if (mode === 'all') run('render', 'src/index.ts', 'Presentacion', 'out/Presentacion.mp4');
