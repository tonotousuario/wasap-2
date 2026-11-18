import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import TcpSocket from 'react-native-tcp-socket';
import {Buffer} from 'buffer';
import {Engine, type Dependencies} from './engine';
import {RpcClient} from './client';
import {ConnectError, classifyConnectFailure} from './errors';

const buildCa = Constants.expoConfig?.extra?.installationCaPem;
const installationCa = typeof buildCa === 'string' && buildCa.includes('BEGIN CERTIFICATE') ? buildCa : null;

// Each server is trusted only through its own CA: the one in its QR, or the build-time one.
const connect: Dependencies['connect'] = (server, onEvent, onDisconnect) =>
  new Promise((resolve, reject) => {
    const ca = server.caPem;
    if (!ca.includes('BEGIN CERTIFICATE')) {
      reject(new ConnectError('config', 'Escanea el código QR del servidor antes de conectar.'));
      return;
    }
    let client: RpcClient | undefined;
    let finished = false;
    // 5 s per address: the engine moves on to the next one when this one does not answer.
    const options = {host: server.host, port: server.port, ca, rejectUnauthorized: true, connectTimeout: 5000};
    const timer = setTimeout(
      () =>
        fail(
          new ConnectError(
            'unreachable',
            'No se pudo conectar. Revisa Wi-Fi, IP, puerto y el permiso de red local.',
            'tiempo de conexión agotado',
          ),
        ),
      7000,
    );
    const socket = TcpSocket.connectTLS(options, () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      client = new RpcClient(
        {write: bytes => socket.write(Buffer.from(bytes)), destroy: () => socket.destroy()},
        onEvent,
        onDisconnect,
      );
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 10000);
      resolve(client);
    });
    function fail(cause: unknown) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      // El tipo decide el mensaje principal; el texto nativo queda como diagnóstico.
      const kind = classifyConnectFailure(detail);
      const error =
        cause instanceof ConnectError
          ? cause
          : new ConnectError(
              kind,
              kind === 'tls'
                ? 'El servidor no presentó un certificado válido para esta dirección.'
                : kind === 'closed'
                  ? 'Se cerró la conexión con el servidor.'
                  : 'No se pudo llegar al servidor. Revisa Wi-Fi, IP, puerto y el permiso de red local.',
              detail,
            );
      if (client) {
        client.close(error);
        return;
      }
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    }
    socket.on('data', bytes => client?.receive(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('El servidor cerró la conexión')));
  });

export const engine = new Engine({
  storage: AsyncStorage,
  secure: {
    getItem: key => SecureStore.getItemAsync(key),
    setItem: (key, value) =>
      SecureStore.setItemAsync(key, value, {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),
    removeItem: key => SecureStore.deleteItemAsync(key),
  },
  uuid: () => Crypto.randomUUID(),
  connect,
  sha256: async bytes => {
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  },
  installationCa,
});
