import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {LengthPrefix, Rise, SlideShell} from '../components';
import {byteLength, color, ease, font, frameBytes} from '../theme';

// A complete, valid messages.send request (docs/protocol.md): the length is measured, not typed in.
const PAYLOAD = JSON.stringify({
	v: 1,
	kind: 'request',
	id: '5d0a8c3e-91b7-4f62-a0d4-7e2c19f3b856',
	type: 'messages.send',
	payload: {conversationId: 'b84f1d27-6c3a-4e95-8f10-2a7d5c9e4b63', text: '¡Hola, grupo!'},
});
const LEN = byteLength(PAYLOAD);

// TCP may split one frame across several reads; the decoder waits for the whole frame.
const cut1 = Math.round(PAYLOAD.length * 0.3);
const cut2 = Math.round(PAYLOAD.length * 0.64);
const CHUNKS = [
	{from: 0, to: cut1, at: 30},
	{from: cut1, to: cut2, at: 48},
	{from: cut2, to: PAYLOAD.length, at: 66},
];

const KINDS = [
	{k: 'request', c: color.client, d: 'La app pide algo y le pone un UUID propio.', ex: 'attendance.mark'},
	{k: 'response', c: color.server, d: 'Reutiliza ese UUID: success, o error con código.', ex: 'CONFLICT'},
	{k: 'event', c: color.server, d: 'El servidor avisa sin que se lo pidan.', ex: 'message.created'},
];

export const Trama: React.FC = () => {
	const frame = useCurrentFrame();
	const assembled = ease(frame, 92, 30);
	return (
		<SlideShell index={4} type="avance.protocolo" bytes={frameBytes({LEN, KINDS})} title="La trama del protocolo">
			<div style={{height: 300}}>
				<div style={{display: 'flex', alignItems: 'flex-start'}}>
					<Rise at={16} dist={0} style={{display: 'flex'}}>
						<LengthPrefix n={LEN} size={34} boxed gap={0} />
					</Rise>
					<div
						style={{
							flex: 1,
							minWidth: 0,
							border: `1px solid ${assembled > 0.5 ? color.server : color.rule}`,
							marginLeft: 18,
							padding: '20px 24px',
							fontFamily: font.mono,
							fontSize: 24,
							lineHeight: 1.6,
							color: color.inkSoft,
							wordBreak: 'break-all',
						}}
					>
						{CHUNKS.map((c, i) => {
							const p = ease(frame, c.at, 22);
							const gap = interpolate(assembled, [0, 1], [26, 0]);
							return (
								<span
									key={i}
									style={{
										opacity: p,
										marginRight: i < CHUNKS.length - 1 ? gap : 0,
										paddingBottom: 2,
										borderBottom: `2px solid ${assembled > 0.5 ? 'transparent' : color.client}`,
									}}
								>
									{PAYLOAD.slice(c.from, c.to)}
								</span>
							);
						})}
					</div>
				</div>
				<div style={{display: 'flex', gap: 48, marginTop: 22, fontSize: 28, color: color.inkSoft}}>
					<Rise at={24} style={{width: 290, flex: 'none'}}>
						{LEN} bytes de JSON
					</Rise>
					<Rise at={40}>Llega en pedazos por TCP; se decodifica sólo cuando la trama está completa.</Rise>
				</div>
			</div>

			<div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 64, borderTop: `1px solid ${color.rule}`, paddingTop: 40}}>
				{KINDS.map((k, i) => (
					<Rise key={k.k} at={110 + i * 12}>
						<div style={{fontFamily: font.mono, fontSize: 32, color: k.c}}>"{k.k}"</div>
						<div style={{marginTop: 16, fontSize: 31, lineHeight: 1.4}}>{k.d}</div>
						<div style={{marginTop: 16, fontSize: 26, color: color.inkSoft}}>
							p. ej. <span style={{fontFamily: font.mono}}>{k.ex}</span>
						</div>
					</Rise>
				))}
			</div>
			<Rise at={150}>
				<div style={{marginTop: 40, fontSize: 29, color: color.inkSoft, lineHeight: 1.4}}>
					Cada trama mide de 1 a 65 536 bytes. Si llega malformada se cierra el socket; un error de negocio responde con su código.
				</div>
			</Rise>
		</SlideShell>
	);
};
