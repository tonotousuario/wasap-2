import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Mono, Rise, SlideShell} from '../components';
import {color, ease, font, frameBytes} from '../theme';

// Sequence diagram: two lifelines, one acknowledgement dies in flight.
const APP_X = 40;
const SRV_X = 900;
const TOP = 70;
const ROW = 92;

type Step =
	| {kind: 'note'; lane: 'app' | 'srv'; at: number; text: React.ReactNode}
	| {kind: 'msg'; dir: 'out' | 'back'; at: number; text: React.ReactNode; lost?: boolean; ok?: boolean};

const STEPS: Step[] = [
	{kind: 'note', lane: 'app', at: 24, text: <>Guarda la operación pendiente, UUID <Mono c={color.client}>a3f9…</Mono></>},
	{kind: 'msg', dir: 'out', at: 40, text: <><Mono c={color.client}>attendance.mark</Mono> con <Mono c={color.client}>a3f9…</Mono></>},
	{kind: 'note', lane: 'srv', at: 60, text: <>Registra <Mono c={color.server}>ENTRY</Mono> y hace commit</>},
	{kind: 'msg', dir: 'back', at: 76, lost: true, text: <>La confirmación se pierde</>},
	{kind: 'msg', dir: 'out', at: 104, text: <>Reconecta y reenvía el mismo <Mono c={color.client}>a3f9…</Mono></>},
	{kind: 'msg', dir: 'back', at: 124, ok: true, text: <>Devuelve el resultado original, sin otro registro</>},
];

// Plain-text form of the steps, for measuring the slide's frame length.
const STEP_TEXT = [
	'Guarda la operación pendiente, UUID a3f9…',
	'attendance.mark con a3f9…',
	'Registra ENTRY y hace commit',
	'La confirmación se pierde',
	'Reconecta y reenvía el mismo a3f9…',
	'Devuelve el resultado original, sin otro registro',
];

const FACTS = [
	'Confirma sólo después del commit en PostgreSQL.',
	'Bloquea la fila del usuario y compara el último evento: si la app tenía un estado viejo, responde CONFLICT.',
	'El PIN se guarda con PBKDF2-HMAC-SHA256 y 600 000 iteraciones.',
] as const;
const FACT_NODES: React.ReactNode[] = [
	FACTS[0],
	FACTS[1],
	<>El PIN se guarda con <span style={{whiteSpace: 'nowrap'}}>PBKDF2-HMAC-SHA256</span> y 600 000 iteraciones.</>,
];

const Arrow: React.FC<{y: number; dir: 'out' | 'back'; at: number; lost?: boolean; ok?: boolean}> = ({y, dir, at, lost, ok}) => {
	const frame = useCurrentFrame();
	const reach = lost ? 0.5 : 1;
	const p = ease(frame, at, 22) * reach;
	const x0 = dir === 'out' ? APP_X : SRV_X;
	const x1 = dir === 'out' ? SRV_X : APP_X;
	const xEnd = x0 + (x1 - x0) * p;
	const c = lost ? color.pending : ok ? color.verified : dir === 'out' ? color.client : color.server;
	const packet = interpolate(frame, [at, at + 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const px = x0 + (x1 - x0) * Math.min(packet, reach);
	const dead = lost ? ease(frame, at + 20, 14) : 0;
	const head = dir === 'out' ? -1 : 1;
	return (
		<g>
			<line x1={x0} x2={xEnd} y1={y} y2={y} stroke={c} strokeWidth={2} strokeDasharray={lost ? '10 8' : undefined} />
			{!lost && p > 0.98 && (
				<polyline
					points={`${x1 + head * 16},${y - 9} ${x1},${y} ${x1 + head * 16},${y + 9}`}
					fill="none"
					stroke={c}
					strokeWidth={2}
				/>
			)}
			{frame >= at && packet < 1 && !lost && <rect x={px - 10} y={y - 7} width={20} height={14} fill={c} />}
			{lost && frame >= at && (
				<g opacity={1}>
					{dead < 1 && <rect x={px - 10} y={y - 7} width={20} height={14} fill={c} opacity={1 - dead} />}
					<g opacity={dead} stroke={c} strokeWidth={3}>
						<line x1={xEnd - 14} y1={y - 14} x2={xEnd + 14} y2={y + 14} />
						<line x1={xEnd - 14} y1={y + 14} x2={xEnd + 14} y2={y - 14} />
					</g>
				</g>
			)}
		</g>
	);
};

export const Garantias: React.FC = () => {
	const frame = useCurrentFrame();
	const lanes = ease(frame, 8, 30);
	const height = TOP + ROW * STEPS.length;
	return (
		<SlideShell index={5} type="avance.garantias" bytes={frameBytes({STEP_TEXT, FACTS})} title="Reintentar no duplica">
			<div style={{display: 'grid', gridTemplateColumns: '940px 1fr', gap: 90, height: '100%'}}>
				<div style={{position: 'relative', height}}>
					<div style={{position: 'absolute', left: 0, top: 0, fontFamily: font.mono, fontSize: 28, color: color.client, opacity: lanes}}>app</div>
					<div style={{position: 'absolute', left: SRV_X - 140, width: 140, textAlign: 'right', top: 0, fontFamily: font.mono, fontSize: 28, color: color.server, opacity: lanes}}>
						servidor
					</div>
					<svg width={940} height={height} style={{position: 'absolute', inset: 0}}>
						<line x1={APP_X} x2={APP_X} y1={TOP - 20} y2={TOP - 20 + (height - TOP) * lanes} stroke={color.rule} strokeWidth={1} />
						<line x1={SRV_X} x2={SRV_X} y1={TOP - 20} y2={TOP - 20 + (height - TOP) * lanes} stroke={color.rule} strokeWidth={1} />
						{STEPS.map((s, i) => {
							const y = TOP + ROW * i + 56;
							if (s.kind === 'note') return null;
							return <Arrow key={i} y={y} dir={s.dir} at={s.at} lost={s.lost} ok={s.ok} />;
						})}
					</svg>
					{STEPS.map((s, i) => {
						const p = ease(frame, s.at + 4, 20);
						const y = TOP + ROW * i + 6;
						const alignRight = s.kind === 'note' && s.lane === 'srv';
						return (
							<div
								key={i}
								style={{
									position: 'absolute',
									top: y,
									left: alignRight ? undefined : APP_X + 28,
									right: alignRight ? 940 - SRV_X + 28 : undefined,
									textAlign: alignRight ? 'right' : 'left',
									fontSize: 28,
									whiteSpace: 'nowrap',
									color: s.kind === 'msg' && s.lost ? color.pending : s.kind === 'msg' && s.ok ? color.verified : color.ink,
									opacity: p,
								}}
							>
								{s.text}
							</div>
						);
					})}
				</div>
				<div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 44}}>
					{FACT_NODES.map((f, i) => (
						<Rise key={i} at={150 + i * 10}>
							<p style={{margin: 0, fontSize: 32, lineHeight: 1.4, textWrap: 'pretty'}}>{f}</p>
						</Rise>
					))}
				</div>
			</div>
		</SlideShell>
	);
};
