import React from 'react';
import {useCurrentFrame} from 'remotion';
import {FrameRow, SlideShell, Status, statusLabel, StatusMark} from '../components';
import {color, ease, font, frameBytes} from '../theme';

const ROWS: {part: string; s: Status; evidence: string}[] = [
	{part: 'Protocolo y servidor', s: 'verified', evidence: 'Pruebas de sesiones, chat y asistencia con PostgreSQL y TLS reales'},
	{part: 'Lógica de la app móvil', s: 'verified', evidence: '76 pruebas y TypeScript sin errores. Clases, invitaciones y varios servidores'},
	{part: 'Carga del servidor', s: 'verified', evidence: '2 000 conexiones TLS, 2 000 asistencias y 200 mensajes en 40 s'},
	{part: 'Panel HTTPS', s: 'verified', evidence: 'Acceso de administración y profesores en Chrome con Compose local'},
	{part: 'Android nativo', s: 'verified', evidence: 'APK de alpha firmado y probado en emulador'},
	{part: 'iOS nativo', s: 'pending', evidence: 'Build ad hoc con EAS y prueba en iPhone registrado'},
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
						Evidencia de compilación y pruebas en docs/verification.md.
					</div>
				</FrameRow>
			</div>
		</SlideShell>
	);
};
