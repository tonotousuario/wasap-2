import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  AppState as NativeAppState,
  BackHandler,
  KeyboardAvoidingView,
  PanResponder,
  Pressable,
  StatusBar,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {engine} from './native';
import {explainError, LINK_LABEL, linkState, pendingLabel} from './format';
import {Login, ServerScreen} from './screens/Access';
import {EnrollServer, PasteLink, ScanServer, Servers} from './screens/Servers';
import {Attendance, ClassReport} from './screens/Attendance';
import {Chats, NewChat, NewGroup} from './screens/Chats';
import {Settings} from './screens/Settings';
import {Members, Thread} from './screens/Thread';
import {forgetLocalData, Nav, run, useEngine, useKeyboardVisible, type Navigation, type Route} from './ui/app';
import {Icon, Notice, TopBar, type IconName} from './ui/kit';
import {android, space, type, useTheme} from './ui/theme';

type Tab = 'attendance' | 'chats' | 'settings';
const TABS: {id: Tab; label: string; icon: IconName; iconOn: IconName; title: string}[] = [
  {id: 'attendance', label: 'Asistencia', icon: 'attendance', iconOn: 'attendanceOn', title: 'Wasap'},
  {id: 'chats', label: 'Chats', icon: 'chats', iconOn: 'chatsOn', title: 'Chats'},
  {id: 'settings', label: 'Ajustes', icon: 'settings', iconOn: 'settingsOn', title: 'Ajustes'},
];

/** Screens about servers stay open when the session changes underneath them. */
const SERVER_ROUTES = new Set<Route['name']>(['server', 'serverAddress', 'scan', 'pasteLink', 'enroll']);

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const state = useEngine();
  const {c, isDark} = useTheme();
  const [tab, setTab] = useState<Tab>('attendance');
  const [stack, setStack] = useState<Route[]>([]);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const attempts = useRef(0);

  // Ciclo de vida de la conexión: arranque, reintentos con espera creciente,
  // regreso a primer plano y latido. La lógica vive en el motor.
  useEffect(() => {
    void engine
      .initialize()
      .catch(error => engine.report(error))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready || !state.session || state.needsLogin || state.online || state.busy) return;
    const delay = Math.min(30000, 1000 * 2 ** attempts.current++);
    const timer = setTimeout(() => run(engine.reconnect()), delay);
    return () => clearTimeout(timer);
  }, [ready, state.session, state.needsLogin, state.online, state.busy]);
  useEffect(() => {
    if (state.online) attempts.current = 0;
  }, [state.online]);
  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', next => {
      if (next === 'active' && engine.state.session && !engine.state.busy && !engine.state.needsLogin)
        run(engine.reconnect());
    });
    const heartbeat = setInterval(() => {
      if (engine.state.online && !engine.state.busy) run(engine.query('ping'));
    }, 30000);
    return () => {
      subscription.remove();
      clearInterval(heartbeat);
    };
  }, []);

  const signedIn = !!state.session && !state.needsLogin;
  const userId = state.session?.user.id;
  // Al salir o cambiar de cuenta no queda nada de la anterior en pantalla.
  useEffect(() => {
    forgetLocalData();
    setNotice('');
    setStack(routes => routes.filter(route => SERVER_ROUTES.has(route.name)));
    if (!userId) setTab('attendance');
  }, [userId]);
  useEffect(() => {
    if (!signedIn) setStack(routes => routes.filter(route => SERVER_ROUTES.has(route.name)));
  }, [signedIn]);

  const nav = useMemo<Navigation>(
    () => ({
      push: route => setStack(routes => [...routes, route]),
      pop: () => setStack(routes => routes.slice(0, -1)),
      replace: route => setStack(routes => [...routes.slice(0, -1), route]),
      home: message => {
        setStack([]);
        if (message) {
          setNotice(message);
          setTab('chats');
        }
      },
    }),
    [],
  );
  const depth = stack.length;
  useEffect(() => {
    if (!depth) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      nav.pop();
      return true;
    });
    return () => subscription.remove();
  }, [depth, nav]);
  // iPhone: deslizar desde el borde izquierdo vuelve atrás, como en el sistema.
  const edgeSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dx > 12 && Math.abs(gesture.dy) < 24,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 70) nav.pop();
        },
      }),
    [nav],
  );

  const top = stack[depth - 1];
  let screen: React.ReactNode;
  if (!ready) {
    screen = (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, backgroundColor: c.bg}}>
        <Text style={{fontSize: 34, fontWeight: '800', letterSpacing: 0.2, color: c.primary}}>Wasap</Text>
        <ActivityIndicator accessibilityLabel="Abriendo Wasap" color={c.primary} />
      </View>
    );
  } else if (top?.name === 'server') {
    screen = <Servers />;
  } else if (top?.name === 'serverAddress') {
    screen = <ServerScreen />;
  } else if (top?.name === 'scan') {
    screen = <ScanServer />;
  } else if (top?.name === 'pasteLink') {
    screen = <PasteLink />;
  } else if (top?.name === 'enroll') {
    screen = <EnrollServer key={top.text} text={top.text} />;
  } else if (!signedIn) {
    screen = <Login />;
  } else if (top?.name === 'thread') {
    screen = <Thread key={top.id} id={top.id} />;
  } else if (top?.name === 'members') {
    screen = <Members key={top.id} id={top.id} />;
  } else if (top?.name === 'newChat') {
    screen = <NewChat />;
  } else if (top?.name === 'newGroup') {
    screen = <NewGroup />;
  } else if (top?.name === 'classReport') {
    screen = <ClassReport key={top.id} id={top.id} />;
  } else {
    screen = <Tabs tab={tab} setTab={setTab} notice={notice} clearNotice={() => setNotice('')} />;
  }
  const lightBar = isDark || (android && (signedIn || depth > 0) && ready);
  return (
    <Nav.Provider value={nav}>
      <StatusBar barStyle={lightBar ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={android ? 'height' : 'padding'}>
        {screen}
        {!android && depth > 0 && (
          <View {...edgeSwipe.panHandlers} style={{position: 'absolute', left: 0, top: 100, bottom: 0, width: 22}} />
        )}
      </KeyboardAvoidingView>
    </Nav.Provider>
  );
}

function Tabs({
  tab,
  setTab,
  notice,
  clearNotice,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  notice: string;
  clearNotice: () => void;
}) {
  const state = useEngine();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const current = TABS.find(item => item.id === tab)!;
  const link = linkState(state);
  // Los fallos de conexión ya se explican en la franja de estado.
  const failure =
    state.error && !state.errorCode.startsWith('CONNECT_') && state.errorCode !== 'UNAUTHENTICATED'
      ? explainError(state.errorCode, state.error)
      : null;
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar large title={current.title} subtitle={tab === 'attendance' ? state.session?.user.name : undefined} />
      {link !== 'online' && (
        <View
          accessibilityLiveRegion="polite"
          accessible
          accessibilityLabel={LINK_LABEL[link]}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingHorizontal: space.lg,
            minHeight: 36,
            backgroundColor: link === 'offline' ? c.warnSoft : c.neutralSoft,
          }}
        >
          {link === 'offline' ? (
            <Icon name="offline" size={18} color={c.onWarnSoft} />
          ) : (
            <ActivityIndicator size="small" color={c.textSoft} />
          )}
          <Text style={[type.small, {fontWeight: '600', color: link === 'offline' ? c.onWarnSoft : c.text, flex: 1}]}>
            {link === 'offline' ? 'Sin conexión · reintentando solos' : LINK_LABEL[link]}
          </Text>
        </View>
      )}
      {failure && (
        <Notice
          tone="error"
          title={failure.title}
          body={failure.body}
          onClose={() => engine.clearError()}
          style={{margin: space.md, marginBottom: 0}}
        />
      )}
      {state.pending && tab !== 'attendance' && (
        <Notice
          tone="warn"
          title="Enviado, pendiente de confirmación"
          body={
            state.pendingType === 'messages.send'
              ? `${pendingLabel(state.pendingCount, state.pendingType)}. Se envían en orden y sin duplicarse; otras acciones esperarán.`
              : 'Una operación espera respuesta del servidor. No podrás crear otra hasta que se resuelva.'
          }
          action="Comprobar ahora"
          busy={state.busy}
          onAction={() => run(engine.reconnect())}
          style={{margin: space.md, marginBottom: 0}}
        />
      )}
      <View style={{flex: 1}}>
        {tab === 'attendance' ? (
          <Attendance />
        ) : tab === 'chats' ? (
          <Chats notice={notice} clearNotice={clearNotice} />
        ) : (
          <Settings />
        )}
      </View>
      {!keyboard && (
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderColor: c.line,
            paddingBottom: insets.bottom,
          }}
        >
          {TABS.map(item => {
            const selected = item.id === tab;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{selected}}
                onPress={() => setTab(item.id)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: android ? 72 : 54,
                  gap: 4,
                  paddingVertical: 6,
                }}
              >
                {/* Seleccionado: píldora, icono relleno y texto en negrita; nunca atenuado. */}
                <View
                  collapsable={false}
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 4,
                    borderRadius: 16,
                    backgroundColor: android && selected ? c.primarySoft : 'transparent',
                  }}
                >
                  <Icon
                    name={selected ? item.iconOn : item.icon}
                    color={selected ? (android ? c.onPrimarySoft : c.primary) : c.textSoft}
                  />
                </View>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={{
                    fontSize: 12,
                    lineHeight: 16,
                    fontWeight: selected ? '700' : '500',
                    color: selected ? (android ? c.text : c.primary) : c.textSoft,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
