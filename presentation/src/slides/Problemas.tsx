import React from 'react';
import {FrameRow, SlideShell} from '../components';
import {color, font, frameBytes} from '../theme';

const ITEMS = [
	{p: 'Carrera al retirar a alguien de un grupo', f: 'Bloqueos compartidos por conversación; las tramas en cola se reautorizan justo al escribirse, con plazo de 10 s.'},
	{p: 'Historiales que rebasaban los 64 KiB', f: 'Páginas acotadas por bytes con cursores, y grupos limitados a 100 integrantes.'},
	{p: 'Validación TLS débil en react-native-tcp-socket', f: 'Parche reproducible (checksum SHA-256) que exige cadena, vigencia y host en iOS y Android. Falta probarlo en teléfono.'},
	{p: 'Cuota de disco y puerto perdido de Podman', f: 'Caché de Gradle en el proyecto; reiniciar sólo la base de pruebas desechable.'},
];

export const Problemas: React.FC = () => (
	<SlideShell index={7} type="avance.problemas" bytes={frameBytes(ITEMS)} title="Problemas encontrados y cómo se resolvieron">
		<div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 96, rowGap: 0, marginTop: 30}}>
			{ITEMS.map((it, i) => (
				<FrameRow key={i} at={34 + i * 14}>
					<div style={{padding: '36px 0 56px'}}>
						<div style={{fontFamily: font.display, fontSize: 52, lineHeight: 1.1, color: color.ink, textWrap: 'balance'}}>{it.p}</div>
						<div style={{marginTop: 18, fontSize: 31, lineHeight: 1.45, color: color.inkSoft, maxWidth: '44ch', textWrap: 'pretty'}}>{it.f}</div>
					</div>
				</FrameRow>
			))}
		</div>
	</SlideShell>
);
