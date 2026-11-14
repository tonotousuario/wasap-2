import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {LengthPrefix} from '../components';
import {byteLength, color, ease, font, GUTTER, typed} from '../theme';

const LINES = [
	'{',
	'  "v": 1,',
	'  "kind": "request",',
	'  "id": "7c1e0b9a-4f2d-4e8a-9b31-2d6f0c5e8a14",',
	'  "type": "auth.login",',
	'  "payload": {',
	'    "matricula": "20260001",',
	'    "pin": "••••••"',
	'  }',
	'}',
];
const JSON_TEXT = LINES.join('\n');
const TOTAL = byteLength(JSON_TEXT);

export const Portada: React.FC = () => {
	const frame = useCurrentFrame();
	const shown = typed(JSON_TEXT, frame, 34, 150);
	const count = byteLength(shown);
	const done = shown.length === JSON_TEXT.length;
	const title = ease(frame, 4, 40);
	const sub = ease(frame, 22, 30);
	const foot = ease(frame, 40, 30);
	const caret = done ? Math.floor(frame / 15) % 2 === 0 : true;

	return (
		<AbsoluteFill style={{background: color.ground, color: color.ink, fontFamily: font.read}}>
			<div
				style={{
					position: 'absolute',
					left: GUTTER,
					top: 250,
					width: 860,
				}}
			>
				<div
					style={{
						fontFamily: font.display,
						fontSize: 280,
						lineHeight: 0.86,
						letterSpacing: '0.005em',
						whiteSpace: 'nowrap',
						opacity: title,
						transform: `translateY(${(1 - title) * 40}px)`,
					}}
				>
					WASA<span style={{marginLeft: '0.035em'}}>P</span> 2
				</div>
				<p
					style={{
						marginTop: 56,
						fontSize: 46,
						lineHeight: 1.25,
						color: color.ink,
						opacity: sub,
						maxWidth: 780,
						textWrap: 'balance',
					}}
				>
					Asistencia y mensajería sobre un protocolo propio{' '}
					<span style={{fontFamily: font.display, fontStyle: 'italic', fontSize: 54, color: color.client}}>
						TCP + TLS
					</span>
				</p>
			</div>

			<div
				style={{
					position: 'absolute',
					right: GUTTER,
					top: 236,
					width: 760,
					fontFamily: font.mono,
					fontVariantNumeric: 'tabular-nums',
				}}
			>
				<div style={{display: 'flex', alignItems: 'baseline', gap: 22}}>
					<LengthPrefix n={count} size={40} boxed gap={16} />
					<span style={{fontSize: 26, color: color.inkSoft}}>
						{count} / {TOTAL} bytes
					</span>
				</div>
				<div style={{marginTop: 18, fontFamily: font.read, fontSize: 26, color: color.inkSoft}}>
					Cabecera de 4 bytes con la longitud de la trama
				</div>
				<pre
					style={{
						marginTop: 34,
						padding: '28px 32px',
						fontFamily: font.mono,
						fontSize: 25,
						lineHeight: 1.55,
						color: color.inkSoft,
						background: color.groundRaised,
						borderTop: `1px solid ${color.client}`,
						minHeight: 430,
						whiteSpace: 'pre',
					}}
				>
					{shown}
					<span style={{opacity: caret ? 1 : 0, color: color.client}}>▍</span>
				</pre>
			</div>

			<div
				style={{
					position: 'absolute',
					left: GUTTER,
					right: GUTTER,
					bottom: 70,
					paddingTop: 26,
					borderTop: `1px solid ${color.rule}`,
					display: 'flex',
					justifyContent: 'space-between',
					fontSize: 26,
					color: color.inkSoft,
					opacity: foot,
				}}
			>
				<span>Presentación de avances · 13 de noviembre de 2026</span>
				<span style={{fontFamily: font.mono, fontSize: 26}}>feat/tcp-attendance</span>
			</div>
		</AbsoluteFill>
	);
};
