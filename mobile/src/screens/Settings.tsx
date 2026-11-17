import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {engine} from '../native';
import {explainError, LINK_LABEL, linkState, momentLabel, pendingLabel} from '../format';
import {run, useEngine, useNav} from '../ui/app';
import {Avatar, Button, Icon, SectionTitle} from '../ui/kit';
import {android, radius, space, type, useTheme} from '../ui/theme';

const LINK_HELP = {
  connecting: 'Abriendo la conexión segura con el servidor.',
  reconnecting: 'Se perdió la conexión; la estamos recuperando.',
  syncing: 'Conectado. Poniendo al día asistencia y conversaciones.',
  online: 'Todo al día con el servidor.',
  offline: 'No hay conexión con el servidor. Reintentamos solos cada cierto tiempo.',
} as const;
const OPERATIONS: Record<string, string> = {
  'attendance.mark': 'Registro de asistencia',
  'messages.send': 'Envío de mensaje',
  'conversations.direct': 'Apertura de chat privado',
  'groups.create': 'Creación de grupo',
  'groups.add': 'Alta de integrante',
  'groups.remove': 'Baja de integrante',
};

export function Settings() {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const [diagnostics, setDiagnostics] = useState(false);
  const session = state.session;
  if (!session) return null;
  const link = linkState(state);
  const now = new Date();
  const logout = () =>
    Alert.alert('¿Cerrar sesión?', state.pending ? (state.pendingType === 'messages.send' && state.pendingCount > 1 ? `Hay ${state.pendingCount} mensajes sin confirmar. Si sales ahora se descartan y no sabrás desde aquí si el servidor los registró.` : 'Hay una operación sin confirmar. Si sales ahora se descarta y no sabrás desde aquí si el servidor la registró.') : 'Tendrás que escribir tu matrícula y tu PIN para volver a entrar.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Cerrar sesión', style: 'destructive', onPress: () => run(engine.logout())}]);
  const facts: [string, string][] = [
    ['Servidor', state.server.host],
    ['Puerto', String(state.server.port)],
    ['Cifrado', 'TLS con el certificado de instalación'],
    ['Estado', LINK_LABEL[link]],
    ['Sesión válida hasta', momentLabel(session.expiresAt, now)],
    ['Operación pendiente', state.pending ? `${OPERATIONS[state.pendingType ?? ''] ?? 'Sí'}${state.pendingCount > 1 ? ` (${state.pendingCount})` : ''}` : 'Ninguna'],
    ['Último aviso', state.error ? `${state.errorCode || 'sin código'}: ${state.error}` : 'Ninguno'],
  ];
  const group = {backgroundColor: c.surface, borderRadius: radius.block, borderWidth: android ? 0 : 1, borderColor: c.line, overflow: 'hidden'} as const;
  return (
    <ScrollView style={{flex: 1, backgroundColor: c.bgAlt}} contentContainerStyle={{padding: space.lg, paddingBottom: space.xxl, gap: space.xl}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: space.lg}}>
        <Avatar name={session.user.name} size={60} />
        <View style={{flex: 1}}>
          <Text accessibilityRole="header" style={[type.title, {color: c.text}]}>{session.user.name}</Text>
          <Text style={[type.body, {color: c.textSoft}]}>Matrícula {session.user.matricula}</Text>
        </View>
      </View>

      <View style={{gap: space.sm}}>
        <SectionTitle>Conexión</SectionTitle>
        <View style={group}>
          <View accessible accessibilityLabel={`${LINK_LABEL[link]}. ${LINK_HELP[link]}`} style={{flexDirection: 'row', gap: space.md, padding: space.lg, alignItems: 'flex-start'}}>
            <Icon name={link === 'online' ? 'check' : link === 'offline' ? 'offline' : 'sync'} color={link === 'online' ? c.primary : c.textSoft} />
            <View style={{flex: 1}}>
              <Text style={[type.body, {color: c.text, fontWeight: '600'}]}>{LINK_LABEL[link]}</Text>
              <Text style={[type.small, {color: c.textSoft}]}>{LINK_HELP[link]}</Text>
              {state.pending && <Text style={[type.small, {color: c.onWarnSoft, backgroundColor: c.warnSoft, marginTop: space.sm, padding: space.sm, borderRadius: 8, overflow: 'hidden'}]}>{state.pendingType === 'messages.send' ? pendingLabel(state.pendingCount, state.pendingType) : `${OPERATIONS[state.pendingType ?? ''] ?? 'Una operación'}: enviado, pendiente de confirmación`}.</Text>}
            </View>
          </View>
          <View style={{height: 1, backgroundColor: c.line, marginLeft: space.lg}} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Servidor ${state.server.host}, puerto ${state.server.port}. Cambiar`} onPress={() => nav.push({name: 'server'})} android_ripple={{color: c.line}} style={{flexDirection: 'row', gap: space.md, padding: space.lg, alignItems: 'center', minHeight: 64}}>
            <Icon name="server" color={c.textSoft} />
            <View style={{flex: 1}}>
              <Text style={[type.body, {color: c.text, fontWeight: '600'}]}>Servidor</Text>
              <Text style={[type.small, {color: c.textSoft}]}>{state.server.host} · puerto {state.server.port}</Text>
            </View>
            <Icon name="forward" size={20} color={c.textSoft} />
          </Pressable>
        </View>
        <Button variant="tonal" icon="refresh" label={state.online ? 'Sincronizar ahora' : 'Reconectar ahora'} loading={state.busy} onPress={() => run(engine.reconnect())} />
      </View>

      <View style={group}>
        <Pressable accessibilityRole="button" accessibilityLabel="Diagnóstico" accessibilityState={{expanded: diagnostics}} accessibilityHint="Detalles técnicos para quien administra el servidor" onPress={() => setDiagnostics(open => !open)} android_ripple={{color: c.line}} style={{flexDirection: 'row', alignItems: 'center', padding: space.lg, minHeight: 56, gap: space.md}}>
          <Text style={[type.body, {color: c.text, fontWeight: '600', flex: 1}]}>Diagnóstico</Text>
          <Icon name={diagnostics ? 'up' : 'down'} color={c.textSoft} />
        </Pressable>
        {diagnostics && (
          <View style={{paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md}}>
            <Text style={[type.small, {color: c.textSoft}]}>Detalles técnicos. Compártelos con quien administra el servidor si algo falla.</Text>
            {facts.map(([label, value]) => (
              <View key={label}>
                <Text style={[type.caption, {color: c.textSoft}]}>{label}</Text>
                <Text selectable style={[type.small, {color: c.text}]}>{value}</Text>
              </View>
            ))}
            {!!state.error && <Text style={[type.small, {color: c.textSoft}]}>En palabras simples: {explainError(state.errorCode, '').title.toLowerCase()}.</Text>}
          </View>
        )}
      </View>

      <View style={{gap: space.md}}>
        <Button variant="danger" icon="logout" label="Cerrar sesión" disabled={state.busy && !state.online} onPress={logout} />
        <Text style={[type.caption, {color: c.textSoft, textAlign: 'center'}]}>WASAP · proyecto de la asignatura de Redes. No es, ni pretende ser, el otro mensajero verde.</Text>
      </View>
    </ScrollView>
  );
}
