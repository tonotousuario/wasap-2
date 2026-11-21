const slides = Array.from(document.querySelectorAll('.slide'));
const stage = document.querySelector('#stage');
const canvas = document.querySelector('#canvas');
const back = document.querySelector('#back');
const forward = document.querySelector('#forward');
const position = document.querySelector('#position');
const notes = document.querySelector('#notes');
const notesToggle = document.querySelector('#notes-toggle');
const full = document.querySelector('#full');
const receiptButtons = Array.from(document.querySelectorAll('[data-receipt]'));
let current = 0;

function fit() {
  const scale = Math.min(stage.clientWidth / 1440, stage.clientHeight / 810);
  canvas.style.setProperty('--scale', scale);
}

function show(index) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides.forEach((slide, i) => {
    slide.hidden = i !== current;
    slide.classList.toggle('entering', i === current);
  });
  back.disabled = current === 0;
  forward.disabled = current === slides.length - 1;
  position.value = `${current + 1} / ${slides.length}`;
  document.querySelector('#progress').style.width = `${(current + 1) * 100 / slides.length}%`;
  document.querySelector('#notes-copy').textContent = slides[current].querySelector('.speaker-note').textContent;
  stage.scrollTop = 0;
}

function toggleNotes() {
  notes.hidden = !notes.hidden;
  notesToggle.setAttribute('aria-expanded', String(!notes.hidden));
}

async function toggleFullscreen() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
}

function selectReceipt(index) {
  const button = receiptButtons[index];
  document.querySelector('.message-demo').dataset.state = index;
  document.querySelector('#receipt-icon').setAttribute('href', button.querySelector('use').getAttribute('href'));
  document.querySelector('#receipt-label').textContent = button.dataset.label;
  receiptButtons.forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)));
}

back.addEventListener('click', () => show(current - 1));
forward.addEventListener('click', () => show(current + 1));
notesToggle.addEventListener('click', toggleNotes);
full.addEventListener('click', () => void toggleFullscreen().catch(() => {}));
document.addEventListener('fullscreenchange', () => {
  full.setAttribute('aria-pressed', String(!!document.fullscreenElement));
  full.setAttribute('aria-label', document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa');
});
receiptButtons.forEach((button, i) => button.addEventListener('click', () => selectReceipt(i)));

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.key === ' ' && event.target instanceof HTMLButtonElement) return;
  if (['ArrowRight', 'PageDown', ' '].includes(event.key)) show(current + 1);
  else if (['ArrowLeft', 'PageUp'].includes(event.key)) show(current - 1);
  else if (event.key === 'Home') show(0);
  else if (event.key === 'End') show(slides.length - 1);
  else if (event.key.toLowerCase() === 'n') toggleNotes();
  else if (event.key.toLowerCase() === 'f') void toggleFullscreen().catch(() => {});
  else if (event.key === 'Escape' && !notes.hidden) toggleNotes();
  else if (slides[current].classList.contains('receipts') && /^[123]$/.test(event.key))
    selectReceipt(Number(event.key) - 1);
  else return;
  event.preventDefault();
});

full.hidden = !document.fullscreenEnabled;
new ResizeObserver(fit).observe(stage);
fit();
show(0);
