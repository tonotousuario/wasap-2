import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Rise, SlideShell} from '../components';
import {color, ease, font, frameBytes} from '../theme';

const NODE_W = 400;
const GAP = 240;
const LINE_Y = 64;

type Node = {name: string; tone: string; lines: string[]};
const NODES: Node[] = [
	{name: 'App móvil', tone: color.client, lines: ['Expo SDK 58', 'React Native 0.88', 'Android e iPhone', 'CA de instalación embebida']},
	{name: 'Servidor', tone: color.server, lines: ['Kotlin · JVM 25', 'Docker Compose', 'Migraciones antes de escuchar']},
	{name: 'PostgreSQL', tone: color.inkSoft, lines: ['Remoto · 17 o posterior', 'Credenciales sólo aquí', 'Identidad validada por TLS']},
];

const LINKS = [
	{label: 'TLS 1.2+', sub: 'TCP :5050'},
	{label: 'JDBC', sub: 'sobre TLS'},
];

const Packet: React.FC<{x0: number; x1: number; start: number; c: string; back?: boolean}> = ({x0, x1, start, c, back}) => {
	const frame = useCurrentFrame();
	const period = 54;
	const t = ((frame - start) % period) / period;
	if (frame < start) return null;
	const p = back ? 1 - t : t;
	const x = interpolate(p, [0, 1], [x0, x1]);
	const o = interpolate(t, [0, 0.1, 0.9, 1], [0, 1, 1, 0]);
	return <rect x={x - 9} y={LINE_Y + (back ? 10 : -22)} width={18} height={12} fill={c} opacity={o} />;
};

export const Arquitectura: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<SlideShell index={3} type="avance.arquitectura" bytes={frameBytes({NODES, LINKS})} title="Arquitectura">
			<div style={{position: 'relative', height: 400}}>
				<svg width={1680} height={200} style={{position: 'absolute', top: 0, left: 0}}>
					{LINKS.map((_, i) => {
						const x0 = NODE_W * (i + 1) + GAP * i + 16;
						const x1 = x0 + GAP - 32;
						const p = ease(frame, 40 + i * 12, 30);
						return (
							<g key={i}>
								<line x1={x0} x2={x0 + (x1 - x0) * p} y1={LINE_Y} y2={LINE_Y} stroke={color.inkFaint} strokeWidth={2} />
								<Packet x0={x0} x1={x1} start={70 + i * 10} c={i === 0 ? color.client : color.server} />
								<Packet x0={x0} x1={x1} start={97 + i * 10} c={color.server} back />
							</g>
						);
					})}
				</svg>
				{NODES.map((n, i) => (
					<Rise key={n.name} at={20 + i * 12} style={{position: 'absolute', left: i * (NODE_W + GAP), top: 0, width: NODE_W}}>
						<div style={{borderTop: `1px solid ${n.tone}`, paddingTop: 30}}>
							<div style={{fontFamily: font.display, fontSize: 68, lineHeight: 1}}>{n.name}</div>
							<div style={{marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12}}>
								{n.lines.map((l) => (
									<div key={l} style={{fontSize: 29, lineHeight: 1.3, color: color.inkSoft}}>
										{l}
									</div>
								))}
							</div>
						</div>
					</Rise>
				))}
				{LINKS.map((l, i) => (
					<Rise
						key={l.label}
						at={56 + i * 12}
						style={{
							position: 'absolute',
							left: NODE_W * (i + 1) + GAP * i,
							width: GAP,
							top: LINE_Y + 40,
							textAlign: 'center',
							fontFamily: font.mono,
						}}
					>
						<div style={{fontSize: 26, color: color.ink}}>{l.label}</div>
						<div style={{fontSize: 26, color: color.inkSoft, marginTop: 6}}>{l.sub}</div>
					</Rise>
				))}
			</div>
			<Rise at={100}>
				<div style={{borderTop: `1px solid ${color.rule}`, paddingTop: 34}}><p style={{margin: 0, fontSize: 32, lineHeight: 1.45, maxWidth: '62ch'}}>
					La app nunca habla con la base de datos. No guarda el PIN ni llaves privadas: sólo el certificado público de la CA, que valida la cadena, la vigencia y la IP del servidor.
				</p></div>
			</Rise>
		</SlideShell>
	);
};
