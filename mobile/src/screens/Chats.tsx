import React, {useEffect, useState} from 'react';
import {FlatList, Pressable, RefreshControl, ScrollView, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {engine} from '../native';
import {
  canSearchDirectory,
  conversationTitle,
  DIRECTORY_HINT,
  explainError,
  kindLabel,
  listTime,
  previewText,
  sortConversations,
} from '../format';
import type {Conversation, User} from '../types';
import {rememberPeer, run, useDebounced, useEngine, useNav, usePeers} from '../ui/app';
import {Avatar, Button, Chip, Empty, Field, Icon, IconButton, Notice, PersonRow, SkeletonRows, TopBar} from '../ui/kit';
import {android, space, type, useTheme} from '../ui/theme';

type Filter = 'ALL' | 'DIRECT' | 'GROUP';
const FILTERS: {id: Filter; label: string}[] = [
  {id: 'ALL', label: 'Todos'},
  {id: 'DIRECT', label: 'Privados'},
  {id: 'GROUP', label: 'Grupos'},
];

export function Chats({notice, clearNotice}: {notice: string; clearNotice: () => void}) {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const [filter, setFilter] = useState<Filter>('ALL');
  const peers = usePeers(state.conversations, state.online);
  const ownId = state.session?.user.id;
  const now = new Date();
  const sorted = sortConversations(state.conversations, state.messages);
  const shown = filter === 'ALL' ? sorted : sorted.filter(conversation => conversation.kind === filter);
  const canCreate = state.online && !state.pending;
  const loadingFirst = !state.conversations.length && state.busy;

  const row = ({item}: {item: Conversation}) => {
    const messages = state.messages[item.id] ?? [];
    const lastMessage = messages[messages.length - 1];
    const title = conversationTitle(item, peers.get(item.id), messages, ownId);
    const preview = previewText(lastMessage, item.kind, ownId);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${kindLabel(item.kind)}. ${preview}`}
        accessibilityHint="Abre la conversación"
        onPress={() => nav.push({name: 'thread', id: item.id})}
        android_ripple={{color: c.line}}
        style={({pressed}) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingHorizontal: space.lg,
            minHeight: 72,
            paddingVertical: space.sm,
          },
          pressed && !android && {backgroundColor: c.bgAlt},
        ]}
      >
        <Avatar name={title} kind={item.kind} />
        <View style={{flex: 1, gap: 2}}>
          <View style={{flexDirection: 'row', alignItems: 'baseline', gap: space.sm}}>
            <Text numberOfLines={1} style={[type.heading, {color: c.text, flex: 1}]}>
              {title}
            </Text>
            {!!lastMessage && (
              <Text style={[type.caption, {color: c.textSoft}]}>{listTime(lastMessage.createdAt, now)}</Text>
            )}
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            {item.kind !== 'DIRECT' && (
              <Icon name={item.kind === 'GROUP' ? 'group' : 'general'} size={15} color={c.textSoft} />
            )}
            <Text numberOfLines={1} style={[type.small, {color: c.textSoft, flex: 1}]}>
              {preview}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FlatList
        data={shown}
        keyExtractor={item => item.id}
        renderItem={row}
        contentContainerStyle={{paddingBottom: 96}}
        refreshControl={
          <RefreshControl
            refreshing={false}
            enabled={state.online && !state.busy}
            onRefresh={() => run(engine.refreshConversations())}
            colors={[c.primary]}
            tintColor={c.primary}
          />
        }
        ListHeaderComponent={
          <View style={{gap: space.md, paddingTop: space.md, paddingBottom: space.sm}}>
            {!!notice && (
              <Notice
                tone="info"
                icon="alert"
                title={notice}
                onClose={clearNotice}
                style={{marginHorizontal: space.lg}}
              />
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityRole="radiogroup"
              accessibilityLabel="Tipo de conversación"
              contentContainerStyle={{gap: space.sm, paddingHorizontal: space.lg}}
            >
              {FILTERS.map(option => (
                <Chip
                  key={option.id}
                  label={option.label}
                  selected={filter === option.id}
                  onPress={() => setFilter(option.id)}
                />
              ))}
            </ScrollView>
            {!android && (
              <View style={{flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg}}>
                <Button
                  variant="tonal"
                  icon="newChat"
                  label="Mensaje privado"
                  disabled={!canCreate}
                  onPress={() => nav.push({name: 'newChat'})}
                  style={{flex: 1}}
                />
                <Button
                  variant="tonal"
                  icon="groupAdd"
                  label="Crear grupo"
                  disabled={!canCreate}
                  onPress={() => nav.push({name: 'newGroup'})}
                  style={{flex: 1}}
                />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loadingFirst ? (
            <View style={{paddingHorizontal: space.lg}}>
              <SkeletonRows count={4} />
            </View>
          ) : filter === 'ALL' ? (
            <Empty
              icon="chats"
              title="Sin conversaciones"
              body={
                state.online
                  ? 'Desliza hacia abajo para actualizar, o empieza un chat nuevo.'
                  : 'Se cargarán cuando vuelva la conexión.'
              }
            />
          ) : (
            <Empty
              icon={filter === 'GROUP' ? 'group' : 'person'}
              title={filter === 'GROUP' ? 'Aún no estás en ningún grupo' : 'Aún no tienes chats privados'}
              body={
                filter === 'GROUP'
                  ? 'Crea uno y elige a sus integrantes.'
                  : 'Busca a alguien por nombre o matrícula para escribirle.'
              }
            >
              <Button
                variant="tonal"
                icon={filter === 'GROUP' ? 'groupAdd' : 'newChat'}
                label={filter === 'GROUP' ? 'Crear grupo' : 'Nuevo mensaje privado'}
                disabled={!canCreate}
                onPress={() => nav.push({name: filter === 'GROUP' ? 'newGroup' : 'newChat'})}
              />
            </Empty>
          )
        }
      />
      {android && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nuevo chat"
          accessibilityHint="Elige a una persona para un mensaje privado o crea un grupo"
          accessibilityState={{disabled: !canCreate}}
          disabled={!canCreate}
          onPress={() => nav.push({name: 'newChat'})}
          android_ripple={{color: '#FFFFFF44'}}
          style={{
            position: 'absolute',
            right: space.lg,
            bottom: space.lg,
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: canCreate ? c.primary : c.neutralSoft,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            elevation: canCreate ? 4 : 0,
          }}
        >
          <Icon name="newChat" color={canCreate ? c.onPrimary : c.textSoft} />
        </Pressable>
      )}
    </View>
  );
}

/** Búsqueda en el directorio con sus estados de carga, vacío y fallo. */
function useDirectory() {
  const state = useEngine();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[] | null>(null);
  const [failed, setFailed] = useState('');
  const settled = useDebounced(query.trim());
  const ready = canSearchDirectory(settled);
  useEffect(() => {
    setFailed('');
    // Solo búsquedas: sin 3 caracteres no se consulta el servidor ni se muestra a nadie.
    if (!state.online || !ready) {
      setUsers(null);
      return;
    }
    let cancelled = false;
    engine.query('users.list', {query: settled}).then(
      result => {
        if (!cancelled) setUsers((result.users as User[]).filter(user => user.id !== engine.state.session?.user.id));
      },
      error => {
        if (!cancelled) setFailed(explainError(error?.code ?? '', error instanceof Error ? error.message : '').body);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [settled, ready, state.online]);
  return {query, setQuery, users, failed, ready: canSearchDirectory(query), searching: query.trim() !== settled};
}

function DirectoryStatus({
  users,
  failed,
  online,
  query,
  ready,
}: {
  users: User[] | null;
  failed: string;
  online: boolean;
  query: string;
  ready: boolean;
}) {
  if (!ready)
    return <Empty icon="search" title={DIRECTORY_HINT} body="Busca a la persona por su nombre o su matrícula." />;
  if (failed) return <Notice tone="error" title="No se pudo buscar" body={failed} style={{margin: space.lg}} />;
  if (!users)
    return online ? (
      <View style={{paddingHorizontal: space.lg}}>
        <SkeletonRows count={5} />
      </View>
    ) : (
      <Empty
        icon="offline"
        title="Sin conexión"
        body="El directorio se consulta en el servidor. Vuelve a intentarlo al reconectar."
      />
    );
  if (!users.length)
    return (
      <Empty
        icon="search"
        title={query ? 'Nadie coincide' : 'No hay más personas'}
        body={
          query
            ? `No encontramos a «${query}». Revisa el nombre o la matrícula.`
            : 'Cuando haya más cuentas en el servidor aparecerán aquí.'
        }
      />
    );
  return null;
}

function SearchField({query, setQuery}: {query: string; setQuery: (text: string) => void}) {
  const {c} = useTheme();
  return (
    <Field
      label="Buscar por nombre o matrícula"
      value={query}
      onChangeText={setQuery}
      returnKeyType="search"
      right={
        query ? (
          <IconButton icon="close" label="Borrar búsqueda" color={c.textSoft} onPress={() => setQuery('')} />
        ) : (
          <Icon name="search" size={22} color={c.textSoft} />
        )
      }
    />
  );
}

export function NewChat() {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const directory = useDirectory();
  const [opening, setOpening] = useState('');
  const [problem, setProblem] = useState('');
  const locked = !state.online || state.busy || state.pending;
  const open = async (user: User) => {
    setOpening(user.id);
    setProblem('');
    try {
      const result = await engine.mutate('conversations.direct', {matricula: user.matricula});
      rememberPeer(result.conversation.id, user.name);
      nav.replace({name: 'thread', id: result.conversation.id});
    } catch {
      setProblem(explainError(engine.state.errorCode, engine.state.error).body);
      engine.clearError();
    } finally {
      setOpening('');
    }
  };
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar title="Nuevo chat" subtitle="Mensaje privado" onBack={nav.pop} />
      <FlatList
        data={directory.users ?? []}
        keyExtractor={user => user.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{paddingBottom: insets.bottom + space.xl}}
        ListHeaderComponent={
          <View style={{gap: space.sm, paddingTop: space.md}}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Crear grupo"
              accessibilityHint="Ponle nombre y elige a sus integrantes"
              disabled={locked}
              onPress={() => nav.replace({name: 'newGroup'})}
              android_ripple={{color: c.line}}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 64,
                paddingHorizontal: space.lg,
                opacity: locked ? 0.5 : 1,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="groupAdd" size={22} color={c.onPrimary} />
              </View>
              <Text style={[type.body, {color: c.text, fontWeight: '600', flex: 1}]}>Crear grupo</Text>
              <Icon name="forward" size={20} color={c.textSoft} />
            </Pressable>
            <View style={{paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.sm}}>
              <SearchField query={directory.query} setQuery={directory.setQuery} />
              {!!problem && (
                <Notice tone="error" title="No se pudo abrir el chat" body={problem} onClose={() => setProblem('')} />
              )}
              {state.pending && (
                <Notice
                  tone="warn"
                  title="Hay un envío pendiente de confirmar"
                  body="Podrás abrir chats nuevos cuando se resuelva."
                />
              )}
              <Text accessibilityRole="header" style={[type.small, {color: c.textSoft, fontWeight: '600'}]}>
                Personas{directory.users?.length === 100 ? ' · primeras 100, acota la búsqueda' : ''}
              </Text>
            </View>
          </View>
        }
        renderItem={({item}) => (
          <PersonRow
            name={item.name}
            detail={item.matricula}
            disabled={locked}
            hint="Abre un chat privado"
            onPress={() => void open(item)}
            right={opening === item.id ? <Text style={[type.caption, {color: c.textSoft}]}>Abriendo…</Text> : undefined}
          />
        )}
        ListEmptyComponent={
          <DirectoryStatus
            users={directory.users}
            failed={directory.failed}
            online={state.online}
            query={directory.query.trim()}
            ready={directory.ready}
          />
        }
      />
    </View>
  );
}

export function NewGroup() {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const directory = useDirectory();
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<User[]>([]);
  const [asClass, setAsClass] = useState(false);
  const canTeach = state.session?.user.role === 'teacher' || state.session?.user.role === 'admin';
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState('');
  const locked = !state.online || state.busy || state.pending;
  const full = chosen.length >= 99; // 100 integrantes contando a quien crea el grupo.
  const toggle = (user: User) =>
    setChosen(list =>
      list.some(item => item.id === user.id) ? list.filter(item => item.id !== user.id) : full ? list : [...list, user],
    );
  const create = async () => {
    setCreating(true);
    setProblem('');
    try {
      const matriculas = chosen.map(user => user.matricula);
      const result = asClass
        ? await engine.createClass(name.trim(), matriculas)
        : await engine.mutate('groups.create', {name: name.trim(), matriculas});
      nav.replace({name: 'thread', id: result.conversation.id});
    } catch {
      // El nombre y la selección se conservan para reintentar.
      setProblem(
        engine.state.pending
          ? 'El servidor aún no confirma. Al reconectar se resolverá sin crear el grupo dos veces.'
          : explainError(engine.state.errorCode, engine.state.error).body,
      );
      engine.clearError();
    } finally {
      setCreating(false);
    }
  };
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar
        title={asClass ? 'Crear clase' : 'Crear grupo'}
        subtitle={chosen.length ? `${chosen.length + 1} integrantes contigo` : 'Elige a sus integrantes'}
        onBack={nav.pop}
      />
      <FlatList
        data={directory.users ?? []}
        keyExtractor={user => user.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{paddingBottom: space.xl}}
        ListHeaderComponent={
          <View style={{padding: space.lg, gap: space.md}}>
            {canTeach && (
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Tipo"
                style={{flexDirection: 'row', gap: space.sm}}
              >
                <Chip label="Grupo" selected={!asClass} onPress={() => setAsClass(false)} />
                <Chip label="Clase con asistencia" selected={asClass} onPress={() => setAsClass(true)} />
              </View>
            )}
            <Field
              label={asClass ? 'Nombre de la clase' : 'Nombre del grupo'}
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
              maxLength={80}
              placeholder="Por ejemplo: Redes 5.º A"
            />
            {!!chosen.length && (
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: space.sm}}>
                {chosen.map(user => (
                  <Pressable
                    key={user.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar a ${user.name} de la selección`}
                    onPress={() => toggle(user)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      minHeight: 48,
                      paddingLeft: space.lg,
                      paddingRight: space.md,
                      borderRadius: 24,
                      backgroundColor: c.primarySoft,
                    }}
                  >
                    <Text style={[type.small, {color: c.onPrimarySoft, fontWeight: '600'}]}>
                      {user.name.split(/\s+/)[0]}
                    </Text>
                    <Icon name="close" size={16} color={c.onPrimarySoft} />
                  </Pressable>
                ))}
              </View>
            )}
            <SearchField query={directory.query} setQuery={directory.setQuery} />
            <Text style={[type.small, {color: c.textSoft}]}>
              {asClass
                ? 'Eres responsable de la clase: sus integrantes registran asistencia en ella y tú ves la lista.'
                : 'Tú creas el grupo y siempre formas parte de él. Solo tú podrás añadir o quitar integrantes.'}
            </Text>
          </View>
        }
        renderItem={({item}) => {
          const selected = chosen.some(user => user.id === item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`${item.name}, ${item.matricula}`}
              accessibilityState={{checked: selected, disabled: !selected && full}}
              disabled={!selected && full}
              onPress={() => toggle(item)}
              android_ripple={{color: c.line}}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 64,
                paddingHorizontal: space.lg,
                opacity: !selected && full ? 0.5 : 1,
              }}
            >
              <Avatar name={item.name} size={44} />
              <View style={{flex: 1}}>
                <Text style={[type.body, {color: c.text, fontWeight: '500'}]}>{item.name}</Text>
                <Text style={[type.small, {color: c.textSoft}]}>{item.matricula}</Text>
              </View>
              <Icon name={selected ? 'selected' : 'unselected'} size={26} color={selected ? c.primary : c.outline} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <DirectoryStatus
            users={directory.users}
            failed={directory.failed}
            online={state.online}
            query={directory.query.trim()}
            ready={directory.ready}
          />
        }
      />
      <View
        style={{
          padding: space.lg,
          paddingBottom: Math.max(insets.bottom, space.lg),
          gap: space.sm,
          borderTopWidth: 1,
          borderColor: c.line,
          backgroundColor: c.surface,
        }}
      >
        {!!problem && (
          <Notice
            tone={state.pending ? 'warn' : 'error'}
            title={state.pending ? 'Enviado, pendiente de confirmación' : 'No se creó el grupo'}
            body={problem}
          />
        )}
        {!state.online && (
          <Text style={[type.small, {color: c.textSoft, textAlign: 'center'}]}>
            Sin conexión. Tu selección se conserva.
          </Text>
        )}
        <Button
          icon="group"
          label={
            creating
              ? 'Creando…'
              : `Crear ${asClass ? 'clase' : 'grupo'}${chosen.length ? ` con ${chosen.length + 1} integrantes` : ''}`
          }
          loading={creating}
          disabled={locked || !name.trim()}
          hint={!name.trim() ? 'Escribe un nombre para el grupo' : undefined}
          onPress={() => void create()}
        />
      </View>
    </View>
  );
}
