import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(16);

Config.overrideWebpackConfig(config => {
	for (const rule of config.module?.rules ?? []) {
		if (rule && typeof rule === 'object' && String(rule.test) === '/\\.css$/i')
			rule.resourceQuery = {not: [/raw/]};
	}
	config.module!.rules!.push({resourceQuery: /raw/, type: 'asset/source'});
	return config;
});
