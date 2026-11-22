const $ = (selector, root = document) => root.querySelector(selector);
const slides = Array.from(document.querySelectorAll('.slide'));
const canvas = $('#canvas');
const dots = $('#dots');
const notes = $('#notes');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
let current = -1;
let timers = [];

const later = (ms, fn) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
const stopTimers = () => { timers.forEach(clearTimeout); timers.forEach(clearInterval); timers = []; };
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

/* ---------- 4 · la trama: longitud real en bytes ---------- */
const FRAME = [
  ['{', 'p'], ['"v"', 'k'], [':', 'p'], ['1', 'n'], [',', 'p'],
  ['"kind"', 'k'], [':', 'p'], ['"request"', 's'], [',', 'p'],
  ['"id"', 'k'], [':', 'p'], ['"b1d4c6a2-3f0e-4d8a-9c57-6e2f81a0d9b3"', 's'], [',', 'p'],
  ['"type"', 'k'], [':', 'p'], ['"attendance.mark"', 's'], [',', 'p'],
  ['"payload"', 'k'], [':', 'p'], ['{', 'p'], ['"expectedLastEventId"', 'k'], [':', 'p'], ['null', 'n'], ['}', 'p'], ['}', 'p'],
];
const frameText = FRAME.map(([text]) => text).join('');
const hex32 = n => n.toString(16).padStart(8, '0').toUpperCase().match(/../g).join(' ');

function renderFrame(chars) {
  let left = chars;
  const html = [];
  for (const [text, cls] of FRAME) {
    if (left <= 0) break;
    html.push(`<span class="${cls}">${text.slice(0, left).replace(',', ',\u200b')}</span>`);
    left -= text.length;
  }
  $('#json').innerHTML = html.join('');
  const bytes = new TextEncoder().encode(frameText.slice(0, chars)).length;
  $('#bytes').textContent = bytes;
  $('#hdr-hex').textContent = hex32(bytes);
}

function startFrame() {
  const hdr = $('#hdr');
  hdr.classList.remove('done');
  hdr.classList.add('ghost');
  $('#caret').classList.remove('off');
  const finish = () => {
    renderFrame(frameText.length);
    $('#caret').classList.add('off');
    hdr.classList.remove('ghost');
    hdr.classList.add('done');
  };
  if (calm) return finish();
  renderFrame(0);
  let typed = 0;
  later(1100, () => {
    const id = setInterval(() => {
      typed += 2;
      renderFrame(typed);
      if (typed >= frameText.length) { clearInterval(id); later(250, finish); }
    }, 38);
    timers.push(id);
  });
}

/* ---------- 5 · palomitas ---------- */
const RECEIPT = [
  { icon: '#clock', label: 'Pendiente', desc: 'El teléfono espera la respuesta del servidor.' },
  { icon: '#check', label: 'Enviado', desc: 'El servidor lo guardó en PostgreSQL.' },
  { icon: '#double', label: 'Visto por alguien', desc: 'Otro participante lo tuvo en pantalla con el chat abierto.' },
];

function setReceipt(i, animate = true) {
  const r = RECEIPT[i];
  const bubble = $('#receipt');
  bubble.dataset.state = i;
  $('#bigmark').dataset.state = i;
  $('#r-icon').setAttribute('href', r.icon);
  $('#big-use').setAttribute('href', r.icon);
  $('#r-label').textContent = r.label;
  $('#r-desc').textContent = r.desc;
  document.querySelectorAll('#ladder li').forEach((li, n) => {
    li.classList.toggle('act', n === i);
    li.classList.toggle('past', n < i);
  });
  if (animate && !calm) { restart(bubble, 'snap'); restart($('#bigmark'), 'snap'); }
}

function startReceipts() {
  setReceipt(calm ? 2 : 0, false);
  if (calm) return;
  let i = 0;
  timers.push(setInterval(() => { i = (i + 1) % 3; setReceipt(i); }, 2800));
}

/* ---------- 6 · reintento con el mismo UUID ---------- */
const STORY = [
  '1 · El teléfono envía la solicitud con un UUID.',
  '2 · El servidor guarda y hace commit en PostgreSQL.',
  '3 · La respuesta se pierde: se cortó el Wi‑Fi.',
  '4 · El teléfono reintenta con el mismo UUID.',
  '5 · El servidor reconoce el UUID y repite la respuesta. Una sola fila.',
];

function startRetry() {
  const arrows = Array.from(document.querySelectorAll('#lanes .arrow'));
  const rows = $('#rows');
  const reset = () => {
    arrows.forEach(a => a.classList.remove('show'));
    $('#rows-n').textContent = '0';
    $('#story').textContent = STORY[0];
  };
  const play = n => {
    arrows[n].classList.add('show');
    $('#story').textContent = STORY[n];
    if (n === 1) { $('#rows-n').textContent = '1'; restart(rows, 'bump'); }
    if (n === 4) restart(rows, 'bump');
  };
  if (calm) { arrows.forEach((_, n) => play(n)); return; }
  const cycle = () => {
    reset();
    arrows.forEach((_, n) => later(1100 + n * 1900, () => play(n)));
    later(1100 + arrows.length * 1900 + 4500, cycle);
  };
  cycle();
}

/* ---------- 9 · en vivo: cada paso se confirma al comprobarlo ---------- */
function toggleStep(n) {
  const li = document.querySelectorAll('#run li')[n];
  if (!li) return;
  const done = li.classList.toggle('done');
  li.classList.toggle('ghost', !done);
}
function startLive() {
  document.querySelectorAll('#run li').forEach(li => { li.classList.remove('done'); li.classList.add('ghost'); });
}

const starters = { 3: startFrame, 4: startReceipts, 5: startRetry, 8: startLive };

/* ---------- navegación ---------- */
const themeOf = slide => ['green', 'night', 'cream', 'live'].find(t => slide.classList.contains(`s-${t}`));

function show(index) {
  index = Math.max(0, Math.min(slides.length - 1, index));
  if (index === current) return;
  const back = index < current;
  stopTimers();
  slides.forEach((slide, i) => {
    if (i === current) {
      slide.classList.remove('on');
      slide.classList.add('leaving');
      later(1000, () => slide.classList.remove('leaving'));
    } else if (i !== index) slide.classList.remove('on', 'leaving');
  });
  const slide = slides[index];
  slide.classList.remove('leaving');
  slide.classList.toggle('back', back);
  slide.classList.remove('on');
  void slide.offsetWidth;
  slide.classList.add('on');
  current = index;
  document.body.dataset.theme = themeOf(slide);
  dots.querySelectorAll('button').forEach((dot, i) => {
    dot.classList.toggle('cur', i === index);
    dot.classList.toggle('seen', i < index);
    if (i === index) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current');
  });
  $('#notes-copy').textContent = slide.dataset.note || '';
  history.replaceState(null, '', `#${index + 1}`);
  starters[index]?.();
}

slides.forEach((_, i) => {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.setAttribute('aria-label', `Diapositiva ${i + 1} de ${slides.length}`);
  dot.addEventListener('click', () => show(i));
  dots.append(dot);
});

function fit() { canvas.style.setProperty('--scale', Math.min(innerWidth / 1920, innerHeight / 1080)); }
addEventListener('resize', fit);

async function fullscreen() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
}

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  const key = event.key;
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(key)) show(current + 1);
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(key)) show(current - 1);
  else if (key === 'Home') show(0);
  else if (key === 'End') show(slides.length - 1);
  else if (key.toLowerCase() === 'f') fullscreen().catch(() => {});
  else if (key.toLowerCase() === 'n') notes.hidden = !notes.hidden;
  else if (key === 'Escape') notes.hidden = true;
  else if (current === 4 && /^[123]$/.test(key)) { stopTimers(); setReceipt(Number(key) - 1); }
  else if (current === 8 && /^[1-4]$/.test(key)) toggleStep(Number(key) - 1);
  else return;
  event.preventDefault();
});
document.querySelectorAll('#run li').forEach((li, n) => li.addEventListener('click', () => toggleStep(n)));
canvas.addEventListener('click', event => {
  if (event.target.closest('#run, a, button')) return;
  show(current + (event.clientX < innerWidth * .25 ? -1 : 1));
});

fit();
const start = Math.max(0, (Number(new URLSearchParams(location.search).get('s') || location.hash.slice(1)) || 1) - 1);
const query = new URLSearchParams(location.search);
if (query.has('tick')) setInterval(() => {}, 30); // capturas headless: mantiene avanzando el reloj virtual
Promise.race([document.fonts.ready, new Promise(done => setTimeout(done, 1500))]).then(() => {
  show(start);
  for (const n of query.get('k') || '') toggleStep(Number(n) - 1); // ?k=13 abre con los pasos 1 y 3 confirmados
});
