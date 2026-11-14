import React from 'react';
import {Composition, Series} from 'remotion';
import {FPS, H, SLIDE_FRAMES, W} from './theme';
import {Portada} from './slides/Portada';
import {Alcance} from './slides/Alcance';
import {Arquitectura} from './slides/Arquitectura';
import {Trama} from './slides/Trama';
import {Garantias} from './slides/Garantias';
import {Estado} from './slides/Estado';
import {Problemas} from './slides/Problemas';
import {Siguientes} from './slides/Siguientes';

export const SLIDES = [
	{id: 'S1-Portada', C: Portada},
	{id: 'S2-Alcance', C: Alcance},
	{id: 'S3-Arquitectura', C: Arquitectura},
	{id: 'S4-Trama', C: Trama},
	{id: 'S5-Garantias', C: Garantias},
	{id: 'S6-Estado', C: Estado},
	{id: 'S7-Problemas', C: Problemas},
	{id: 'S8-Siguientes', C: Siguientes},
];

const Deck: React.FC = () => (
	<Series>
		{SLIDES.map(({id, C}) => (
			<Series.Sequence key={id} durationInFrames={SLIDE_FRAMES}>
				<C />
			</Series.Sequence>
		))}
	</Series>
);

export const RemotionRoot: React.FC = () => (
	<>
		{SLIDES.map(({id, C}) => (
			<Composition key={id} id={id} component={C} durationInFrames={SLIDE_FRAMES} fps={FPS} width={W} height={H} />
		))}
		<Composition id="Presentacion" component={Deck} durationInFrames={SLIDE_FRAMES * SLIDES.length} fps={FPS} width={W} height={H} />
	</>
);
