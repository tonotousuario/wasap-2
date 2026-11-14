const { withDangerousMod, withInfoPlist, withAndroidManifest } = require('expo/config-plugins');
const patchTls = require('./patch-tls.cjs');

module.exports = function withWasapTLS(config) {
  // Run for both platforms even when node_modules was installed with scripts disabled.
  for (const platform of ['ios', 'android']) {
    config = withDangerousMod(config, [platform, async mod => { patchTls(); return mod; }]);
  }
  config = withInfoPlist(config, mod => {
    mod.modResults.NSLocalNetworkUsageDescription = 'WASAP se conecta al servidor de asistencia y mensajes de tu institución en la red local.';
    return mod;
  });
  config = withAndroidManifest(config, mod => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'false';
    return mod;
  });
  return config;
};
