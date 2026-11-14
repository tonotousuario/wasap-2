import {loadFont as loadSerif} from '@remotion/google-fonts/InstrumentSerif';
import {loadFont as loadReading} from '@remotion/google-fonts/Literata';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {Easing, interpolate} from 'remotion';

const serif = loadSerif('normal', {weights: ['400'], subsets: ['latin', 'latin-ext']});
loadSerif('italic', {weights: ['400'], subsets: ['latin', 'latin-ext']});
const reading = loadReading('normal', {weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext']});
const mono = loadMono('normal', {weights: ['400', '500', '700'], subsets: ['latin', 'latin-ext']});

export const font = {
	display: serif.fontFamily,
	read: reading.fontFamily,
	mono: mono.fontFamily,
};

export const color = {
	ground: '#0F1216',
	groundRaised: '#161A20',
	rule: '#2A3039',
	ink: '#E9E4D8',
	inkSoft: '#B6B1A6',
	inkFaint: '#8C887F',
	client: '#F2A33A',
	server: '#7FB2D9',
	verified: '#9CC98A',
	partial: '#E7C36A',
	pending: '#D9644A',
};

export const FPS = 30;
export const SLIDE_FRAMES = 210;
export const W = 1920;
export const H = 1080;
export const GUTTER = 120;

const expoOut = Easing.out(Easing.exp);

/** 0→1 progress with exponential ease-out, starting at `start` frames. */
export const ease = (frame: number, start: number, duration = 24) =>
	frame >= start + duration
		? 1
		: interpolate(frame, [start, start + duration], [0, 1], {
		easing: expoOut,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

/** Characters to reveal for a typing effect. */
export const typed = (text: string, frame: number, start: number, cps = 60) => {
	const n = Math.floor(Math.max(0, frame - start) * (cps / FPS));
	return text.slice(0, Math.min(text.length, n));
};

export const hex4 = (n: number) =>
	[24, 16, 8, 0].map((s) => ((n >>> s) & 0xff).toString(16).toUpperCase().padStart(2, '0'));

export const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Length of a slide's content serialized as the protocol would send it. */
export const frameBytes = (content: unknown) => byteLength(JSON.stringify(content));

/** Index of the first significant byte; earlier zero bytes render faint. */
export const firstSignificant = (bytes: string[]) => {
	const i = bytes.findIndex((b) => b !== '00');
	return i === -1 ? bytes.length - 1 : i;
};
