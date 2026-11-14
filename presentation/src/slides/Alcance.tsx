import React from 'react';
import {FrameRow, Mono, SlideShell} from '../components';
import {color, font, frameBytes} from '../theme';

const ROWS: {name: string; body: string; ops: string[]; side: 'client' | 'server'}[] = [
	{
		name: 'Asistencia',
		body: 'Entrada y salida alternadas, sin reinicio a medianoche. Cada persona consulta sólo su historial, con filtro por fechas.',
		ops: ['attendance.mark', 'attendance.list'],
		side: 'client',
	},
	{
		name: 'Mensajería',
		body: 'Chat general, conversaciones privadas y grupos de hasta 100 integrantes. Mensajes de texto de hasta 4000 caracteres.',
		ops: ['messages.send', 'groups.create'],
		side: 'client',
	},
	{
		name: 'Administración',
		body: 'Por consola del servidor: alta de usuarios, restablecer PIN y consultar asistencia por rango de fechas.',
		ops: ['admin users add', 'admin attendance'],
		side: 'server',
	},
];

export const Alcance: React.FC = () => (
	<SlideShell index={2} type="avance.alcance" bytes={frameBytes(ROWS)} title="Qué hace WASAP 2">
		<div style={{display: 'flex', flexDirection: 'column'}}>
			{ROWS.map((r, i) => (
				<FrameRow key={r.name} at={30 + i * 16}>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: '360px 1fr 420px',
							gap: 48,
							alignItems: 'baseline',
							padding: '28px 0',
						}}
					>
						<div style={{fontFamily: font.display, fontSize: 64, lineHeight: 1}}>{r.name}</div>
						<div style={{fontSize: 34, lineHeight: 1.4, color: color.ink, maxWidth: '38ch'}}>{r.body}</div>
						<div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
							{r.ops.map((o) => (
								<Mono key={o} c={r.side === 'client' ? color.client : color.server} size={26}>
									{o}
								</Mono>
							))}
						</div>
					</div>
				</FrameRow>
			))}
			<FrameRow at={84}>
				<div style={{paddingTop: 30, fontSize: 28, color: color.inkSoft}}>
					Sin HTTP: todo el tráfico de la app viaja por el protocolo propio, sobre TLS.
				</div>
			</FrameRow>
		</div>
	</SlideShell>
);
