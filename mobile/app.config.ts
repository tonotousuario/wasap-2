import type {ExpoConfig} from 'expo/config';
import {X509Certificate} from 'node:crypto';

const caPem = (process.env.WASAP_CA_PEM ?? '').replace(/\\n/g, '\n').trim();
if (!caPem || caPem.includes('PRIVATE KEY') || (caPem.match(/BEGIN CERTIFICATE/g) ?? []).length !== 1)
  throw new Error('WASAP_CA_PEM debe contener exactamente un certificado CA público PEM (sin claves privadas).');
const certificate = new X509Certificate(caPem);
if (!certificate.ca) throw new Error('WASAP_CA_PEM debe ser la CA de instalación, no el certificado del servidor.');

const config: ExpoConfig = {
  name: 'WASAP',
  slug: 'wasap',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {bundleIdentifier: 'mx.wasap.app', supportsTablet: false, infoPlist: {ITSAppUsesNonExemptEncryption: false}},
  android: {
    package: 'mx.wasap.app',
    permissions: ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'],
  },
  plugins: ['expo-dev-client', 'expo-secure-store', './plugins/with-tls.cjs'],
  extra: {
    installationCaPem: caPem,
    ...(process.env.EAS_PROJECT_ID ? {eas: {projectId: process.env.EAS_PROJECT_ID}} : {}),
  },
};
export default config;
