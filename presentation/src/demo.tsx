import {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, Composition, Easing, interpolate, registerRoot, Series, useCurrentFrame, useDelayRender} from 'remotion';
import markup from '../demo.html?raw';
import stylesheet from '../demo.css?raw';

declare const require: {context: (directory: string, recursive: boolean, pattern: RegExp) => (path: string) => string};
const screenshots = require.context('../../docs/images', false, /\.png$/);
const fps = 30;
const size = {width: 1440, height: 810};
const scenes = [
	{key: 'cover', title: 'Demo-Portada', seconds: 5, elements: '.cover-media img', start: 7, spacing: 6},
	{key: 'setup', title: 'Demo-Red-Local', seconds: 7, elements: '.roles div, .panel-frame', start: 6, spacing: 5},
	{key: 'signup', title: 'Demo-Registro', seconds: 8, elements: '.signup-story figure', start: 6, spacing: 24},
	{key: 'receipts', title: 'Demo-Palomitas', seconds: 9, elements: '.receipt-demo', start: 3, spacing: 0},
	{key: 'attendance', title: 'Demo-Profesor', seconds: 7, elements: '.attendance-media figure', start: 6, spacing: 20},
	{key: 'recovery', title: 'Demo-Reconexion', seconds: 7, elements: '.recovery-steps li, .recovery-media', start: 6, spacing: 11},
	{key: 'live', title: 'Demo-En-Vivo', seconds: 6, elements: '.run-sheet li', start: 4, spacing: 7},
] as const;
type Scene = typeof scenes[number];

const receiptFrames = [0, 78, 163] as const;
const ease = Easing.out(Easing.exp);
const progress = (frame: number, start: number, length: number) =>
	interpolate(frame, [start, start + length], [0, 1], {
		easing: ease,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

const videoStyles = stylesheet
	.replace(/@font-face\s*\{[^}]*\}/g, '')
	.replace(':root {', ':host {')
	.replace(/\n@media[\s\S]*$/, '') + `
		:host {
			display: block;
			width: 100%;
			height: 100%;
			background: var(--ground);
			color: var(--ink);
			font-family: var(--reading);
		}
		.video-progress { position: absolute; inset: auto 88px 26px; height: 1px; background: var(--rule); }
		.video-progress span { display: block; height: 100%; background: var(--amber); transform-origin: left; }
	`;

let loadingFonts: Promise<FontFace[]> | undefined;
function loadFonts() {
	loadingFonts ??= Promise.all([
		new FontFace('Instrument Serif', `url(${new URL('../demo-assets/instrument-serif.woff2', import.meta.url)})`),
		new FontFace('Instrument Serif', `url(${new URL('../demo-assets/instrument-serif-italic.woff2', import.meta.url)})`, {style: 'italic'}),
		new FontFace('Literata', `url(${new URL('../demo-assets/literata.woff2', import.meta.url)})`, {weight: '400 600'}),
		new FontFace('JetBrains Mono', `url(${new URL('../demo-assets/jetbrains-mono.woff2', import.meta.url)})`),
	].map(async font => {
		document.fonts.add(font);
		return font.load();
	}));
	return loadingFonts;
}

function DemoSlide({scene, index}: {scene: Scene; index: number}) {
	const frame = useCurrentFrame();
	const host = useRef<HTMLDivElement>(null);
	const {delayRender, continueRender, cancelRender} = useDelayRender();
	const mounted = useRef<{
		slide: HTMLElement;
		elements: HTMLElement[];
		rule: HTMLElement;
		receipts: HTMLButtonElement[];
	} | null>(null);

	useLayoutEffect(() => {
		const handle = delayRender(`Cargando recursos de ${scene.title}`);
		const shadow = host.current!.shadowRoot ?? host.current!.attachShadow({mode: 'open'});
		const template = document.createElement('template');
		template.innerHTML = markup;
		const slide = template.content.querySelector<HTMLElement>(`section.${scene.key}`);
		const symbols = template.content.querySelector('svg.symbols');
		if (!slide || !symbols) {
			cancelRender(new Error(`Falta la diapositiva ${scene.key}`));
			return;
		}
		slide.hidden = false;
		if (scene.key === 'receipts') slide.querySelector('figcaption')!.textContent = 'Ejemplo · Chat General';
		const images = Array.from(slide.querySelectorAll('img'));
		images.forEach(image => {
			image.src = screenshots(`./${image.getAttribute('src')!.split('/').at(-1)}`);
		});
		const style = Object.assign(document.createElement('style'), {textContent: videoStyles});
		const track = Object.assign(document.createElement('div'), {className: 'video-progress'});
		const rule = track.appendChild(document.createElement('span'));
		shadow.replaceChildren(style, symbols, slide, track);
		mounted.current = {
			slide,
			elements: Array.from(slide.querySelectorAll(scene.elements)),
			rule,
			receipts: Array.from(slide.querySelectorAll('[data-receipt]')),
		};
		let active = true;
		Promise.all([loadFonts(), ...images.map(image => image.decode())]).then(
			() => { if (active) continueRender(handle); },
			error => { if (active) cancelRender(error); },
		);
		return () => {
			active = false;
			continueRender(handle);
			mounted.current = null;
		};
	}, [scene, delayRender, continueRender, cancelRender]);

	useLayoutEffect(() => {
		const view = mounted.current;
		if (!view) return;
		view.elements.forEach((element, i) => {
			const reveal = progress(frame, scene.start + i * scene.spacing, 17);
			element.style.opacity = String(reveal);
			if (scene.key === 'cover') element.style.transform = `translateY(${(1 - reveal) * 35}px)`;
			else element.style.clipPath = `inset(0 ${(1 - reveal) * 100}% 0 0)`;
		});
		view.rule.style.transform = `scaleX(${(index + progress(frame, 0, 24)) / scenes.length})`;
		if (scene.key === 'receipts') {
			const state = frame < receiptFrames[1] ? 0 : frame < receiptFrames[2] ? 1 : 2;
			view.receipts.forEach((button, i) => button.setAttribute('aria-pressed', String(i === state)));
			const button = view.receipts[state];
			const bubble = view.slide.querySelector<HTMLElement>('.message-demo')!;
			bubble.dataset.state = String(state);
			const label = bubble.querySelector<HTMLElement>('#receipt-label')!;
			label.textContent = button.dataset.label!;
			bubble.querySelector('#receipt-icon')!.setAttribute('href', button.querySelector('use')!.getAttribute('href')!);
			label.style.opacity = String(.6 + .4 * progress(frame, receiptFrames[state], 11));
		}
	}, [frame, index, scene]);

	return <AbsoluteFill><div ref={host} /></AbsoluteFill>;
}

function DemoLAN() {
	return (
		<Series>
			{scenes.map((scene, index) => (
				<Series.Sequence key={scene.key} name={scene.title} durationInFrames={scene.seconds * fps}>
					<DemoSlide scene={scene} index={index} />
				</Series.Sequence>
			))}
		</Series>
	);
}

function Root() {
	return (
		<>
			<Composition id="DemoLAN" component={DemoLAN} durationInFrames={scenes.reduce((sum, scene) => sum + scene.seconds * fps, 0)} fps={fps} {...size} />
			{scenes.map((scene, index) => (
				<Composition key={scene.key} id={scene.title} component={DemoSlide} defaultProps={{scene, index}} durationInFrames={scene.seconds * fps} fps={fps} {...size} />
			))}
		</>
	);
}

registerRoot(Root);
