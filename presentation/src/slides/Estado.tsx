import React from 'react';
import {useCurrentFrame} from 'remotion';
import {FrameRow, SlideShell, Status, statusLabel, StatusMark} from '../components';
import {color, ease, font, frameBytes} from '../theme';

const ROWS: {part: string; s: Status; evidence: string}[] = [
	{part: 'Protocolo y servidor', s: 'verified', evidence: '3 pruebas unitarias y 11 de integración con PostgreSQL y TLS reales'},
	{part: 'Lógica de la app móvil', s: 'verified', evidence: '25 pruebas de comportamiento y TypeScript sin errores'},
	{part: 'Cliente de la app → servidor', s: 'verified', evidence: 'Prueba RPC por TLS, sin teléfono: login, reintento, chats y logout'},
	{part: 'Imagen Docker', s: 'partial', evidence: 'Construida; falta repetir la prueba con la imagen final'},
	{part: 'Android nativo', s: 'partial', evidence: 'Compila el módulo TLS parcheado; aún sin APK completo'},
	{part: 'iOS nativo', s: 'pending', evidence: 'Requiere macOS con Xcode'},
	{part: 'TLS en teléfono físico', s: 'pending', evidence: 'CA incorrecta, certificado vencido, SAN, red local'},
];

export const Estado: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<SlideShell index={6} type="avance.estado" bytes={frameBytes(ROWS)} title="Estado del avance">
			<div style={{marginTop: -36}}>
				{ROWS.map((r, i) => {
					const at = 26 + i * 10;
					return (
						<FrameRow key={r.part} at={at}>
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: '500px 250px 1fr',
									alignItems: 'center',
									padding: '17px 0',
								}}
							>
								<span style={{fontSize: 33}}>{r.part}</span>
								<span style={{display: 'flex', alignItems: 'center', gap: 16, fontFamily: font.mono, fontSize: 26, color: color[r.s]}}>
									<StatusMark s={r.s} p={ease(frame, at + 22, 18)} />
									{statusLabel[r.s]}
								</span>
								<span style={{fontSize: 27, color: color.inkSoft, lineHeight: 1.3, textWrap: 'pretty'}}>{r.evidence}</span>
							</div>
						</FrameRow>
					);
				})}
				<FrameRow at={104}>
					<div style={{paddingTop: 24, fontSize: 26, color: color.inkSoft}}>
						Fuente: docs/progress.md y docs/mobile-report.md. Sin compilaciones en la nube ni publicación en tiendas.
					</div>
				</FrameRow>
			</div>
		</SlideShell>
	);
};
