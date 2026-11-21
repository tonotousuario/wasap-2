import React, {useRef, useState} from 'react';
import {Alert, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {engine} from '../native';
import {explainError} from '../format';
import {splitAddress} from '../enrollment';
import {run, useEngine, useNav} from '../ui/app';
import {Button, Field, Icon, Notice, TopBar} from '../ui/kit';
import {space, type, useTheme} from '../ui/theme';

export function Login() {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const expired = !!state.session && state.needsLogin;
  const [matricula, setMatricula] = useState(state.session?.user.matricula ?? '');
  const [pin, setPin] = useState('');
  const pinRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const pinValid = /^\d{6,12}$/.test(pin);
  const ready = !!matricula.trim() && pinValid && !state.busy;
  const login = () => {
    if (!ready) return;
    const entered = pin;
    setPin(''); // El PIN no se conserva ni en pantalla tras enviarlo.
    run(engine.login(matricula, entered));
  };
  // «Sesión vencida» ya tiene su propio aviso; no se repite como error.
  const failure =
    state.error && state.errorCode !== 'UNAUTHENTICATED' ? explainError(state.errorCode, state.error) : null;
  const connectionFailure = state.errorCode.startsWith('CONNECT_');
  const active = state.servers.find(server => server.id === state.activeServerId);
  if (!active) return <Welcome />;
  return (
    <ScrollView
      style={{flex: 1, backgroundColor: c.bg}}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + space.xxl,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.xl,
        gap: space.xl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{gap: space.sm}}>
        <Text
          accessibilityRole="header"
          style={{fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: 0.2, color: c.primary}}
        >
          Wasap
        </Text>
        <Text style={[type.body, {color: c.textSoft}]}>
          Pasa lista y chatea con tu grupo. Cualquier parecido con otro mensajero es pura coincidencia.
        </Text>
      </View>

      {expired && (
        <Notice
          tone="warn"
          icon="lock"
          title="Tu sesión venció"
          body={
            state.pending
              ? 'Vuelve a entrar con la misma cuenta. La operación que quedó pendiente se confirmará sin duplicarse.'
              : 'Vuelve a entrar para continuar donde te quedaste.'
          }
        />
      )}
      {failure && (
        <Notice
          tone="error"
          icon={connectionFailure ? 'offline' : 'alert'}
          title={failure.title}
          body={failure.body}
          action={connectionFailure ? 'Revisar servidor' : undefined}
          onAction={() => nav.push({name: 'server'})}
          onClose={() => engine.clearError()}
        />
      )}

      <View style={{gap: space.lg}}>
        <Field
          label="Matrícula"
          value={matricula}
          onChangeText={setMatricula}
          autoCapitalize="characters"
          returnKeyType="next"
          onSubmitEditing={() => pinRef.current?.focus()}
          submitBehavior="submit"
          textContentType="username"
          autoComplete="username"
        />
        <Field
          ref={pinRef}
          label="PIN"
          value={pin}
          onChangeText={text => setPin(text.replace(/\D/g, '').slice(0, 12))}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={12}
          textContentType="password"
          autoComplete="off"
          returnKeyType="done"
          onSubmitEditing={login}
          help="De 6 a 12 dígitos. No se guarda en este teléfono."
        />
        <Button
          large
          label={state.busy ? 'Conectando…' : 'Entrar'}
          loading={state.busy}
          disabled={!ready}
          onPress={login}
          hint={!ready && !state.busy ? 'Escribe tu matrícula y un PIN de 6 a 12 dígitos' : undefined}
        />
        <Button
          variant="text"
          label="Soy nuevo: tengo un código de clase"
          disabled={state.busy}
          onPress={() => nav.push({name: 'signup'})}
        />
      </View>

      <View style={{flex: 1}} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Servidor ${active?.name ?? ''}, ${state.server.host}, puerto ${state.server.port}. Cambiar servidor`}
        disabled={state.busy}
        onPress={() => nav.push({name: 'server'})}
        android_ripple={{color: c.line}}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          minHeight: 64,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          borderRadius: 16,
          backgroundColor: c.bgAlt,
        }}
      >
        <Icon name="server" color={c.textSoft} />
        <View style={{flex: 1}}>
          <Text style={[type.caption, {color: c.textSoft}]}>Te conectarás a</Text>
          <Text style={[type.body, {color: c.text, fontWeight: '500'}]} numberOfLines={1}>
            {active?.name ?? 'Servidor'}
          </Text>
          <Text style={[type.small, {color: c.textSoft}]}>
            {state.server.host}:{state.server.port}
          </Text>
        </View>
        <Text style={[type.label, {color: c.primary}]}>Cambiar</Text>
      </Pressable>
    </ScrollView>
  );
}

/** First run without servers: the only way in is a server's QR (or its link). */
function Welcome() {
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{flex: 1, backgroundColor: c.bg}}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + space.xxl,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.xl,
        gap: space.xl,
      }}
    >
      <View style={{gap: space.sm}}>
        <Text
          accessibilityRole="header"
          style={{fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: 0.2, color: c.primary}}
        >
          Wasap
        </Text>
        <Text style={[type.body, {color: c.textSoft}]}>
          Para empezar, escanea el código QR del servidor de tu grupo. Te lo muestra tu profesor o quien lo administra.
        </Text>
      </View>
      <View style={{flex: 1}} />
      <View style={{gap: space.sm}}>
        <Button large icon="qr" label="Escanear código QR" onPress={() => nav.push({name: 'scan'})} />
        <Button
          variant="tonal"
          icon="paste"
          label="Pegar enlace del servidor"
          onPress={() => nav.push({name: 'pasteLink'})}
        />
      </View>
    </ScrollView>
  );
}

/** Address of the hand-configurable installation server. */
export function ServerScreen() {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const manual = state.servers.find(server => server.manual);
  const current = (manual && splitAddress(manual.addresses[0] ?? '')) || state.server;
  const isActive = manual?.id === state.activeServerId;
  const [host, setHost] = useState(current.host);
  const [port, setPort] = useState(String(current.port));
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const portRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const cleanHost = host
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  const changed = cleanHost !== current.host || Number(port) !== current.port;
  const signedIn = !!manual && state.signedIn.includes(manual.id);
  const apply = async () => {
    setSaving(true);
    try {
      await engine.configure({host, port: Number(port)});
      engine.clearError();
      nav.home();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const save = () => {
    setProblem('');
    if (!cleanHost || /[\s/]/.test(cleanHost))
      return setProblem('Escribe una IP o un nombre de servidor, sin espacios ni barras.');
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
      return setProblem('El puerto debe ser un número entre 1 y 65535.');
    if (!changed) return nav.pop();
    if (!signedIn) return void apply();
    const consequences = [`Se cerrará tu sesión en «${manual?.name ?? 'este servidor'}» en este teléfono.`];
    if (isActive && state.pending)
      consequences.push(
        'Hay una operación sin confirmar: se descartará y no sabrás desde aquí si el servidor anterior la registró.',
      );
    consequences.push('Tendrás que volver a entrar en el nuevo servidor.');
    Alert.alert('¿Cambiar la dirección?', consequences.join('\n\n'), [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Cambiar dirección', style: 'destructive', onPress: () => void apply()},
    ]);
  };
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar title="Dirección del servidor" subtitle={manual?.name} onBack={nav.pop} />
      <ScrollView
        contentContainerStyle={{padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.lg}}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[type.body, {color: c.textSoft}]}>
          La dirección del servidor Wasap de tu institución dentro de la red local.
        </Text>
        <Field
          label="IP o nombre"
          value={host}
          onChangeText={setHost}
          keyboardType="url"
          returnKeyType="next"
          onSubmitEditing={() => portRef.current?.focus()}
          submitBehavior="submit"
          placeholder="192.168.1.2"
        />
        <Field
          ref={portRef}
          label="Puerto"
          value={port}
          onChangeText={text => setPort(text.replace(/\D/g, '').slice(0, 5))}
          keyboardType="number-pad"
          maxLength={5}
          returnKeyType="done"
          onSubmitEditing={save}
          help="5050 si nadie te indicó otro."
        />
        {!!problem && <Notice tone="error" title="No se pudo guardar" body={problem} />}
        {signedIn && changed && (
          <Notice
            tone="warn"
            icon="alert"
            title="Cambiar de servidor cierra tu sesión"
            body={
              state.pending
                ? 'También se descartará la operación que sigue pendiente de confirmar.'
                : 'Tus conversaciones y tu historial se volverán a cargar desde el nuevo servidor.'
            }
          />
        )}
        <Button label="Guardar dirección" loading={saving} disabled={state.busy || !manual} onPress={save} />
        <View style={{flexDirection: 'row', gap: space.md, paddingTop: space.sm}}>
          <Icon name="lock" size={20} color={c.textSoft} />
          <Text style={[type.small, {color: c.textSoft, flex: 1}]}>
            La conexión es cifrada y solo funciona si el servidor tiene un certificado válido para esta misma dirección.
            Una IP nueva puede necesitar que quien administra el servidor emita otro certificado.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
