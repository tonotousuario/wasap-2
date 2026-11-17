import type {ExpoConfig} from 'expo/config';
import {X509Certificate} from 'node:crypto';

const caPem = (process.env.WASAP_CA_PEM ?? '').replace(/\\n/g, '\n').trim();
if (!caPem || caPem.includes('PRIVATE KEY') || (caPem.match(/BEGIN CERTIFICATE/g) ?? []).length !== 1)
  throw new Error('WASAP_CA_PEM debe contener exactamente un certificado CA público PEM (sin claves privadas).');
const certificate = new X509Certificate(caPem);
if (!certificate.ca) throw new Error('WASAP_CA_PEM debe ser la CA de instalación, no el certificado del servidor.');

const config: ExpoConfig = {
  name: 'Wasap',
  slug: 'wasap',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    icon: './assets/icon.png',
    bundleIdentifier: 'mx.wasap.app',
    supportsTablet: false,
    infoPlist: {ITSAppUsesNonExemptEncryption: false},
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-foreground.png',
      monochromeImage: './assets/adaptive-monochrome.png',
      backgroundColor: '#0A7C5A',
    },
    package: 'mx.wasap.app',
    permissions: ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'],
  },
  plugins: [
    ['expo-splash-screen', {image: './assets/splash-icon.png', backgroundColor: '#0A7C5A', imageWidth: 200}],
    'expo-dev-client',
    'expo-secure-store',
    './plugins/with-tls.cjs',
    './plugins/with-release-signing.cjs',
  ],
  extra: {
    installationCaPem: caPem,
    eas: {projectId: process.env.EAS_PROJECT_ID ?? '677abc26-c592-4a49-9b5c-d8ea923b3619'},
  },
};
export default config;
