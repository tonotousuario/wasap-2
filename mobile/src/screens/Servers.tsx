import React, {useEffect, useRef, useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {CameraView, useCameraPermissions} from 'expo-camera';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {engine} from '../native';
import {shortFingerprint} from '../enrollment';
import type {SavedServer, ServerPreview} from '../engine';
import {useEngine, useNav} from '../ui/app';
import {Button, Field, Icon, Notice, TopBar} from '../ui/kit';
import {radius, space, type, useTheme} from '../ui/theme';

const addressLine = (server: SavedServer) => server.lastAddress ?? server.addresses[0] ?? 'sin dirección';

/** Every saved server: switch with one tap, add by QR, remove with confirmation. */
export function Servers() {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const [problem, setProblem] = useState('');
  const pick = async (server: SavedServer) => {
    setProblem('');
    if (server.id !== state.activeServerId) {
      try {
        await engine.selectServer(server.id);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    nav.home();
  };
  const remove = (server: SavedServer) => {
    const signedIn = state.signedIn.includes(server.id);
    Alert.alert(
      `¿Eliminar «${server.name}»?`,
      [
        'Se borrará de este teléfono con sus datos guardados.',
        signedIn ? 'Se cerrará tu sesión en ese servidor y se descartará lo que siga pendiente de enviar.' : '',
        'Para volver a usarlo tendrás que escanear su código QR otra vez.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        {text: 'Cancelar', style: 'cancel'},
        {text: 'Eliminar', style: 'destructive', onPress: () => void engine.removeServer(server.id)},
      ],
    );
  };
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar title="Servidores" subtitle={`${state.servers.length} de 10`} onBack={nav.pop} />
      <ScrollView contentContainerStyle={{padding: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.md}}>
        <Text style={[type.body, {color: c.textSoft}]}>
          Cada servidor guarda su propia sesión. Cambiar de uno a otro no cierra las demás.
        </Text>
        {!!problem && <Notice tone="error" title="No se pudo cambiar" body={problem} onClose={() => setProblem('')} />}
        {state.servers.map(server => {
          const active = server.id === state.activeServerId;
          const signedIn = state.signedIn.includes(server.id);
          return (
            <View
              key={server.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: radius.block,
                backgroundColor: active ? c.primarySoft : c.bgAlt,
                overflow: 'hidden',
              }}
            >
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{selected: active, disabled: state.busy}}
                accessibilityLabel={`${server.name}, ${addressLine(server)}, ${signedIn ? 'con sesión' : 'sin sesión'}`}
                disabled={state.busy}
                onPress={() => void pick(server)}
                android_ripple={{color: c.line}}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  minHeight: 72,
                  padding: space.lg,
                }}
              >
                <Icon name={active ? 'selected' : 'server'} size={26} color={active ? c.onPrimarySoft : c.textSoft} />
                <View style={{flex: 1}}>
                  <Text
                    style={[type.body, {color: active ? c.onPrimarySoft : c.text, fontWeight: '600'}]}
                    numberOfLines={1}
                  >
                    {server.name}
                  </Text>
                  <Text style={[type.small, {color: active ? c.onPrimarySoft : c.textSoft}]} numberOfLines={1}>
                    {addressLine(server)} · {signedIn ? 'con sesión' : 'sin sesión'}
                  </Text>
                </View>
              </Pressable>
              {server.manual && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Editar la dirección de ${server.name}`}
                  disabled={state.busy}
                  onPress={() => nav.push({name: 'serverAddress'})}
                  style={{width: 52, minHeight: 72, alignItems: 'center', justifyContent: 'center'}}
                >
                  <Icon name="edit" size={22} color={active ? c.onPrimarySoft : c.textSoft} />
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Eliminar ${server.name}`}
                disabled={state.busy}
                onPress={() => remove(server)}
                style={{width: 52, minHeight: 72, alignItems: 'center', justifyContent: 'center'}}
              >
                <Icon name="trash" size={22} color={active ? c.onPrimarySoft : c.textSoft} />
              </Pressable>
            </View>
          );
        })}
        {!state.servers.length && (
          <Notice
            tone="info"
            icon="server"
            title="Aún no tienes servidores"
            body="Pide a tu profesor o a quien administra el servidor que te muestre su código QR."
          />
        )}
        <View style={{gap: space.sm, paddingTop: space.sm}}>
          <Button
            icon="qr"
            label="Escanear código QR"
            disabled={state.busy || state.servers.length >= 10}
            onPress={() => nav.push({name: 'scan'})}
          />
          <Button
            variant="tonal"
            icon="paste"
            label="Pegar enlace del servidor"
            disabled={state.busy}
            onPress={() => nav.push({name: 'pasteLink'})}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/** Camera permission is asked only here, when the person chose to scan. */
export function ScanServer() {
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [problem, setProblem] = useState('');
  const busy = useRef(false);
  const lastRejected = useRef('');
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);
  const scanned = async (data: string) => {
    if (busy.current || data === lastRejected.current) return;
    busy.current = true;
    const preview = await engine.previewServer(data);
    if (preview.ok) nav.replace({name: 'enroll', text: data});
    else {
      lastRejected.current = data;
      setProblem(preview.reason);
      busy.current = false;
    }
  };
  return (
    <View style={{flex: 1, backgroundColor: '#000'}}>
      <TopBar title="Escanear servidor" subtitle="Apunta al código QR del servidor" onBack={nav.pop} />
      {permission?.granted ? (
        <View style={{flex: 1}}>
          <CameraView
            style={{flex: 1}}
            facing="back"
            barcodeScannerSettings={{barcodeTypes: ['qr']}}
            onBarcodeScanned={result => void scanned(result.data)}
          />
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: space.lg,
              right: space.lg,
              bottom: insets.bottom + space.lg,
              gap: space.sm,
            }}
          >
            {!!problem && (
              <Notice tone="error" title="Ese código no sirve" body={problem} onClose={() => setProblem('')} />
            )}
            <Button
              variant="tonal"
              icon="paste"
              label="Pegar enlace en su lugar"
              onPress={() => nav.replace({name: 'pasteLink'})}
            />
          </View>
        </View>
      ) : (
        <View style={{flex: 1, backgroundColor: c.bg, padding: space.xl, gap: space.lg}}>
          <Notice
            tone="info"
            icon="qr"
            title="Wasap necesita la cámara"
            body="Solo para leer el código QR del servidor. No se toman fotos ni se guardan imágenes."
          />
          {permission && !permission.canAskAgain ? (
            <Text style={[type.body, {color: c.textSoft}]}>
              El permiso está desactivado. Actívalo en los ajustes del teléfono o pega el enlace del servidor.
            </Text>
          ) : (
            <Button icon="qr" label="Permitir cámara" onPress={() => void requestPermission()} />
          )}
          <Button variant="tonal" icon="paste" label="Pegar enlace" onPress={() => nav.replace({name: 'pasteLink'})} />
        </View>
      )}
    </View>
  );
}

/** Alternative without a camera: the same link as text (also handy on emulators). */
export function PasteLink() {
  const nav = useNav();
  const {c} = useTheme();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const review = async () => {
    const preview = await engine.previewServer(text);
    if (preview.ok) nav.replace({name: 'enroll', text: text.trim()});
    else setProblem(preview.reason);
  };
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar title="Pegar enlace" onBack={nav.pop} />
      <ScrollView contentContainerStyle={{padding: space.xl, gap: space.lg}} keyboardShouldPersistTaps="handled">
        <Text style={[type.body, {color: c.textSoft}]}>
          Pega el enlace que empieza por wasap://server. Lo muestra la consola del servidor junto a su código QR.
        </Text>
        <Field
          label="Enlace del servidor"
          value={text}
          onChangeText={value => {
            setText(value);
            setProblem('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          placeholder="wasap://server?v=1&…"
        />
        {!!problem && <Notice tone="error" title="No se puede usar" body={problem} />}
        <Button label="Revisar servidor" disabled={!text.trim()} onPress={() => void review()} />
      </ScrollView>
    </View>
  );
}

/** Shows who the server says it is and its CA fingerprint before trusting it. */
export function EnrollServer({text}: {text: string}) {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<ServerPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    void engine.previewServer(text).then(setPreview);
  }, [text]);
  if (!preview) return <View style={{flex: 1, backgroundColor: c.bg}} />;
  if (!preview.ok)
    return (
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <TopBar title="Servidor" onBack={nav.pop} />
        <View style={{padding: space.xl}}>
          <Notice tone="error" title="No se puede usar" body={preview.reason} />
        </View>
      </View>
    );
  const changed = preview.status === 'ca-changed';
  const confirm = async () => {
    setSaving(true);
    setProblem('');
    try {
      await engine.enrollServer(preview, changed);
      nav.home();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const ask = () => {
    if (!changed) return void confirm();
    Alert.alert(
      '¿Reemplazar la identidad del servidor?',
      'Hazlo solo si quien administra el servidor te confirmó que cambió su certificado. Se cerrará tu sesión en él.',
      [
        {text: 'Cancelar', style: 'cancel'},
        {text: 'Reemplazar', style: 'destructive', onPress: () => void confirm()},
      ],
    );
  };
  const rows: [string, string][] = [
    ['Nombre', preview.link.name],
    ['Direcciones', preview.link.addresses.join('\n')],
    ['Huella de la CA', shortFingerprint(preview.fingerprint)],
  ];
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar
        title={preview.status === 'new' ? 'Añadir servidor' : changed ? 'Identidad cambiada' : 'Actualizar servidor'}
        onBack={nav.pop}
      />
      <ScrollView contentContainerStyle={{padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.lg}}>
        {changed ? (
          <Notice
            tone="error"
            icon="alert"
            title="La identidad de este servidor cambió"
            body="Ya tenías este servidor con otro certificado. Puede ser un cambio legítimo o alguien suplantándolo: pregunta a quien lo administra antes de continuar."
          />
        ) : preview.status === 'known' ? (
          <Notice
            tone="info"
            icon="server"
            title="Ya tienes este servidor"
            body="Se actualizarán su nombre y sus direcciones. Tu sesión se conserva."
          />
        ) : null}
        <View style={{backgroundColor: c.bgAlt, borderRadius: radius.block, padding: space.lg, gap: space.md}}>
          {rows.map(([label, value]) => (
            <View key={label} style={{gap: 2}}>
              <Text style={[type.caption, {color: c.textSoft}]}>{label}</Text>
              <Text style={[type.body, {color: c.text, fontVariant: ['tabular-nums']}]}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={{flexDirection: 'row', gap: space.md}}>
          <Icon name="lock" size={20} color={c.textSoft} />
          <Text style={[type.small, {color: c.textSoft, flex: 1}]}>
            Compara la huella con la que muestra el servidor. La app solo confiará en este certificado para este
            servidor.
          </Text>
        </View>
        {!!problem && <Notice tone="error" title="No se pudo guardar" body={problem} />}
        <Button
          variant={changed ? 'danger' : 'filled'}
          label={preview.status === 'new' ? 'Añadir y usar' : changed ? 'Reemplazar identidad' : 'Actualizar y usar'}
          loading={saving}
          disabled={state.busy}
          onPress={ask}
        />
      </ScrollView>
    </View>
  );
}
