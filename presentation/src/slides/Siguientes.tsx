import React from 'react';
import {FrameRow, Rise, SlideShell} from '../components';
import {color, font, frameBytes} from '../theme';

const NEXT = [
	{t: 'Repetir la prueba completa con la imagen Docker final', op: 'docker compose up --build -d'},
	{t: 'Generar el APK de Android en un equipo con más memoria', op: './gradlew :app:assembleDebug'},
	{t: 'Compilar y firmar la app de iPhone en macOS con Xcode', op: 'npx expo prebuild --platform ios'},
	{t: 'Correr la lista de pruebas TLS en teléfonos físicos', op: 'mobile/README.md'},
	{t: 'Resolver el aviso de npm audit sin bajar a Expo 52', op: 'GHSA-g3hv-75wg-m249'},
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
