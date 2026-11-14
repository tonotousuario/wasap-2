import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {color, ease, firstSignificant, font, GUTTER, hex4} from './theme';

export const TOTAL_SLIDES = 8;

/** The uint32 length prefix: leading zero bytes faint, amber from the first significant byte. */
export const LengthPrefix: React.FC<{n: number; size?: number; boxed?: boolean; gap?: number}> = ({
	n,
	size = 26,
	boxed = false,
	gap = 10,
}) => {
	const bytes = hex4(n);
	const first = firstSignificant(bytes);
	return (
		<span style={{display: 'flex', gap, fontFamily: font.mono, fontSize: size, fontVariantNumeric: 'tabular-nums'}}>
			{bytes.map((b, i) => {
				const on = i >= first;
				return (
					<span
						key={i}
						style={{
							color: on ? color.client : color.inkFaint,
							...(boxed ? {padding: '8px 12px', border: `1px solid ${on ? color.client : color.rule}`} : {}),
						}}
					>
						{b}
					</span>
				);
			})}
		</span>
	);
};

type ShellProps = {
	index: number;
	type: string;
	bytes: number;
	title: React.ReactNode;
	children: React.ReactNode;
};

/**
 * Every slide is framed as a protocol frame: the running head is the
 * uint32 length prefix of the slide's serialized content plus its type.
 */
export const SlideShell: React.FC<ShellProps> = ({index, type, bytes, title, children}) => {
	const frame = useCurrentFrame();
	const head = ease(frame, 0, 30);
	const titleIn = ease(frame, 6, 30);

	return (
		<AbsoluteFill style={{background: color.ground, color: color.ink, fontFamily: font.read}}>
			<div
				style={{
					position: 'absolute',
					top: 50,
					left: GUTTER,
					right: GUTTER,
					display: 'flex',
					alignItems: 'baseline',
					gap: 32,
					fontFamily: font.mono,
					fontSize: 26,
					color: color.inkSoft,
					fontVariantNumeric: 'tabular-nums',
				}}
			>
				<LengthPrefix n={Math.round(bytes * head)} />
				<span>
					"type":<span style={{color: color.ink}}>"{type}"</span>
				</span>
				<span style={{marginLeft: 'auto'}}>
					{index} / {TOTAL_SLIDES}
				</span>
			</div>
			<div
				style={{
					position: 'absolute',
					top: 100,
					left: GUTTER,
					height: 1,
					width: `calc((100% - ${GUTTER * 2}px) * ${head})`,
					background: color.rule,
				}}
			/>
			<h1
				style={{
					position: 'absolute',
					top: 150,
					left: GUTTER,
					right: GUTTER,
					margin: 0,
					fontFamily: font.display,
					fontWeight: 400,
					fontSize: 112,
					lineHeight: 1,
					letterSpacing: '-0.01em',
					opacity: titleIn,
					transform: `translateY(${(1 - titleIn) * 28}px)`,
					textWrap: 'balance',
				}}
			>
				{title}
			</h1>
			<div style={{position: 'absolute', top: 330, left: GUTTER, right: GUTTER, bottom: 80}}>{children}</div>
		</AbsoluteFill>
	);
};

/** Fades and lifts children in, starting at `at` frames. */
export const Rise: React.FC<{at: number; children: React.ReactNode; style?: React.CSSProperties; dist?: number}> = ({
	at,
	children,
	style,
	dist = 22,
}) => {
	const frame = useCurrentFrame();
	const p = ease(frame, at, 26);
	return (
		<div style={{...style, opacity: p, transform: `translateY(${(1 - p) * dist}px)`}}>{children}</div>
	);
};

/**
 * A row that arrives like a frame: its top rule fills in amber as the bytes
 * come in, then cools to a hairline while the content lands.
 */
export const FrameRow: React.FC<{at: number; children: React.ReactNode; style?: React.CSSProperties}> = ({
	at,
	children,
	style,
}) => {
	const frame = useCurrentFrame();
	const fill = ease(frame, at, 16);
	const cool = interpolate(frame, [at + 16, at + 40], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const land = ease(frame, at + 10, 24);
	return (
		<div style={{position: 'relative', ...style}}>
			<div style={{position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: color.rule}} />
			<div
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					height: 2,
					width: `${fill * 100}%`,
					background: color.client,
					opacity: cool,
				}}
			/>
			<div style={{opacity: land, transform: `translateY(${(1 - land) * 14}px)`}}>{children}</div>
		</div>
	);
};

export const Mono: React.FC<{children: React.ReactNode; c?: string; size?: number}> = ({children, c, size}) => (
	<span style={{fontFamily: font.mono, color: c, fontSize: size ? size : '0.86em'}}>{children}</span>
);

export type Status = 'verified' | 'partial' | 'pending';

export const statusLabel: Record<Status, string> = {
	verified: 'Verificado',
	partial: 'Parcial',
	pending: 'Pendiente',
};

/** A status mark drawn as an SVG: filled, half, or open square. `p` animates the fill. */
export const StatusMark: React.FC<{s: Status; size?: number; p?: number}> = ({s, size = 24, p = 1}) => {
	const c = color[s];
	return (
		<svg width={size} height={size} viewBox="0 0 22 22" style={{flex: 'none'}}>
			<rect x="1.5" y="1.5" width="19" height="19" fill="none" stroke={c} strokeWidth="2" />
			{s === 'verified' && <rect x="5" y={5 + 12 * (1 - p)} width="12" height={12 * p} fill={c} />}
			{s === 'partial' && <rect x="5" y={5 + 12 * (1 - p)} width="6" height={12 * p} fill={c} />}
		</svg>
	);
};
