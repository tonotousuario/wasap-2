import React from 'react';
import {FrameRow, Rise, SlideShell} from '../components';
import {color, font, frameBytes} from '../theme';

const NEXT = [
	{t: 'Preparar el servidor para el piloto en la red del aula', op: 'docs/local-runtime.md'},
	{t: 'Probar QR, chat y reconexión con dos teléfonos', op: 'mobile/README.md'},
	{t: 'Generar e instalar la alpha ad hoc de iPhone', op: 'EAS · perfil preview'},
	{t: 'Verificar TLS y permisos de red en hardware real', op: 'mobile/README.md'},
	{t: 'Repetir la prueba de 2 000 conexiones en el equipo de referencia', op: '4 vCPU · 8 GiB de RAM'},
];

export const Siguientes: React.FC = () => (
	<SlideShell index={8} type="avance.siguientes" bytes={frameBytes(NEXT)} title="Siguientes pasos">
		<div style={{display: 'grid', gridTemplateColumns: '1fr 620px', gap: 60, height: '100%'}}>
			<div>
				{NEXT.map((n, i) => (
					<FrameRow key={i} at={28 + i * 10}>
						<div style={{padding: '18px 0 20px'}}>
							<div style={{fontSize: 32, lineHeight: 1.3, textWrap: 'pretty'}}>{n.t}</div>
							<div style={{marginTop: 6, fontFamily: font.mono, fontSize: 26, color: color.inkSoft}}>{n.op}</div>
						</div>
					</FrameRow>
				))}
			</div>
			<Rise at={96} style={{alignSelf: 'end', paddingBottom: 10}}>
				<div style={{fontFamily: font.display, fontStyle: 'italic', fontSize: 124, lineHeight: 0.95, color: color.client}}>
					¿Preguntas?
				</div>
				<div style={{marginTop: 28, fontFamily: font.mono, fontSize: 26, color: color.inkSoft, whiteSpace: 'nowrap'}}>
					"kind":"response" · "type":"success"
				</div>
			</Rise>
		</div>
	</SlideShell>
);
