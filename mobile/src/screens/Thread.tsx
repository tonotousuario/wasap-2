import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {engine} from '../native';
import {
  canSearchDirectory,
  clock,
  conversationTitle,
  dayKey,
  dayLabel,
  DIRECTORY_HINT,
  explainError,
  kindLabel,
} from '../format';
import type {FailedMessage, Message, User} from '../types';
import {OUTBOX_LIMIT} from '../state';
import {drafts, useDebounced, useEngine, useKeyboardVisible, useNav, usePeers} from '../ui/app';
import {
  Avatar,
  Button,
  Empty,
  Field,
  Icon,
  IconButton,
  Notice,
  PersonRow,
  SectionTitle,
  SkeletonRows,
  TopBar,
} from '../ui/kit';
import {radius, space, type, useTheme} from '../ui/theme';

const LIMIT = 4000;
type Row = {message: Message; own: boolean; startsDay: boolean; startsRun: boolean};

export function Thread({id}: {id: string}) {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const conversation = state.conversations.find(item => item.id === id);
  const peers = usePeers(state.conversations, state.online);
  const ownId = state.session?.user.id;
  const messages = state.messages[id] ?? [];
  const title = conversation ? conversationTitle(conversation, peers.get(id), messages, ownId) : '';
  const lastTitle = useRef(title);
  if (title) lastTitle.current = title;

  // El grupo puede dejar de estar disponible mientras está abierto.
  useEffect(() => {
    if (!conversation && state.session && !state.needsLogin)
      nav.home(`Ya no tienes acceso a «${lastTitle.current || 'esa conversación'}».`);
  }, [conversation, state.session, state.needsLogin]);

  const [text, setText] = useState(drafts.get(id) ?? '');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const change = (value: string) => {
    setText(value);
    if (value) drafts.set(id, value);
    else drafts.delete(id);
  };

  const rows = useMemo(() => {
    const list: Row[] = messages.map((message, index) => {
      const previous = messages[index - 1];
      const startsDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
      return {
        message,
        own: message.senderId === ownId,
        startsDay,
        startsRun: startsDay || previous.senderId !== message.senderId,
      };
    });
    return list.reverse(); // Lista invertida: lo más reciente queda abajo.
  }, [messages, ownId]);

  if (!conversation) return <View style={{flex: 1, backgroundColor: c.bg}} />;

  const trimmed = text.trim();
  const tooLong = text.length > LIMIT;
  // Los mensajes se encolan (hasta OUTBOX_LIMIT) y se envían en orden; otra operación pendiente
  // (asistencia, grupos, privados) sí bloquea el envío hasta resolverse.
  const queued = state.outbox.filter(op => op.type === 'messages.send' && op.payload.conversationId === id);
  const failedHere = state.failed[id] ?? [];
  const otherPending = state.pending && state.pendingType !== 'messages.send';
  const full = !otherPending && state.pendingCount >= OUTBOX_LIMIT;
  const blocked = !state.online
    ? 'Sin conexión. Tu borrador se conserva y podrás enviarlo al reconectar.'
    : otherPending
      ? 'Hay una operación pendiente de confirmar. Podrás enviar en cuanto se resuelva.'
      : full
        ? `Hay ${OUTBOX_LIMIT} mensajes esperando confirmación. Podrás enviar más en cuanto el servidor responda.`
        : '';
  const canSend = !!trimmed && !tooLong && state.online && !otherPending && !full && !sending;
  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setFailure('');
    try {
      // Queda guardado en el teléfono antes de enviarse: el cuadro se libera para seguir escribiendo.
      await engine.enqueueMessage({conversationId: id, text: trimmed});
      change('');
    } catch (error) {
      // El borrador se queda: nada se pierde si no se pudo encolar.
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };
  const recover = (failed: FailedMessage) => {
    change(text.trim() ? `${failed.text}\n${text}` : failed.text);
    engine.dismissFailed(id, failed.id);
  };
  const older = state.older[id];
  const loadOlder = async () => {
    if (!older || loadingOlder || !state.online) return;
    setLoadingOlder(true);
    try {
      await engine.loadOlderMessages(id);
    } catch (error) {
      engine.report(error);
    } finally {
      setLoadingOlder(false);
    }
  };
  const showNames = conversation.kind !== 'DIRECT';
  const now = new Date();

  return (
    <View style={{flex: 1, backgroundColor: c.chatBg}}>
      <TopBar
        title={title}
        subtitle={
          conversation.kind === 'GROUP'
            ? `${conversation.isClass ? 'Clase' : 'Grupo'} · toca para ver integrantes`
            : kindLabel(conversation.kind)
        }
        onBack={nav.pop}
        left={<Avatar name={title} kind={conversation.kind} size={38} />}
        onTitlePress={conversation.kind === 'GROUP' ? () => nav.push({name: 'members', id}) : undefined}
        titleHint="Abre la lista de integrantes"
        right={
          conversation.kind === 'GROUP' ? (
            <IconButton
              icon="group"
              label="Integrantes del grupo"
              color={c.onBar}
              onPress={() => nav.push({name: 'members', id})}
            />
          ) : undefined
        }
      />
      <FlatList
        inverted
        data={rows}
        keyExtractor={row => row.message.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // Mantiene el punto de lectura cuando llegan mensajes o se carga historial.
        maintainVisibleContentPosition={{minIndexForVisible: 0, autoscrollToTopThreshold: 120}}
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{paddingHorizontal: space.md, paddingVertical: space.md, flexGrow: 1}}
        ListHeaderComponent={
          failedHere.length || queued.length ? (
            <View style={{gap: space.xs, paddingTop: space.sm}}>
              {failedHere.map(failed => (
                <FailedBubble
                  key={failed.id}
                  failed={failed}
                  onRecover={() => recover(failed)}
                  onDismiss={() => engine.dismissFailed(id, failed.id)}
                />
              ))}
              {queued.map(op => (
                <QueuedBubble key={op.id} text={String(op.payload.text)} />
              ))}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={{flex: 1, justifyContent: 'center'}}>
            <Empty
              icon="chats"
              title="Aún no hay mensajes"
              body={
                conversation.kind === 'GENERAL' ? 'Lo que escribas aquí lo verá todo el grupo.' : 'Escribe el primero.'
              }
            />
          </View>
        }
        ListFooterComponent={
          rows.length ? (
            <View style={{alignItems: 'center', paddingBottom: space.md, minHeight: 40, justifyContent: 'center'}}>
              {loadingOlder ? (
                <ActivityIndicator accessibilityLabel="Cargando mensajes anteriores" color={c.primary} />
              ) : older ? (
                <Button
                  variant="text"
                  label="Cargar mensajes anteriores"
                  disabled={!state.online}
                  onPress={() => void loadOlder()}
                />
              ) : (
                <Text style={[type.caption, {color: c.onBubbleSoft}]}>Inicio de la conversación</Text>
              )}
            </View>
          ) : undefined
        }
        renderItem={({item}) => <Bubble row={item} showName={showNames} now={now} />}
      />
      <View
        style={{
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderColor: c.line,
          paddingHorizontal: space.sm,
          paddingTop: space.sm,
          paddingBottom: keyboard ? space.sm : Math.max(insets.bottom, space.sm),
          gap: space.sm,
        }}
      >
        {!!failure && (
          <Notice
            tone="error"
            title="No se envió"
            body={`${failure}. Tu texto está en el cuadro de mensaje.`}
            onClose={() => setFailure('')}
          />
        )}
        {!!blocked && (
          <View
            accessibilityLiveRegion="polite"
            style={{flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingHorizontal: space.sm}}
          >
            <Icon name={state.online ? 'pending' : 'offline'} size={18} color={c.textSoft} />
            <Text style={[type.small, {color: c.textSoft, flex: 1}]}>{blocked}</Text>
          </View>
        )}
        <View style={{flexDirection: 'row', alignItems: 'flex-end', gap: space.sm}}>
          <TextInput
            accessibilityLabel="Mensaje"
            value={text}
            onChangeText={change}
            multiline
            placeholder="Mensaje"
            placeholderTextColor={c.textSoft}
            selectionColor={c.primary}
            cursorColor={c.primary}
            style={[
              type.body,
              {
                flex: 1,
                minHeight: 48,
                maxHeight: 132,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: tooLong ? c.danger : c.line,
                backgroundColor: c.bgAlt,
                color: c.text,
                paddingHorizontal: space.lg,
                paddingTop: 12,
                paddingBottom: 12,
                textAlignVertical: 'center',
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sending ? 'Enviando mensaje' : 'Enviar mensaje'}
            accessibilityHint={blocked || (tooLong ? 'El mensaje supera los 4000 caracteres' : undefined)}
            accessibilityState={{disabled: !canSend, busy: sending}}
            disabled={!canSend}
            onPress={() => void send()}
            style={({pressed}) => ({
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              collapsable={false}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: canSend || sending ? c.primary : c.neutralSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color={c.onPrimary} />
              ) : (
                <Icon name="send" size={22} color={canSend ? c.onPrimary : c.textSoft} />
              )}
            </View>
          </Pressable>
        </View>
        {text.length > LIMIT - 400 && (
          <Text
            accessibilityLiveRegion="polite"
            style={[type.caption, {color: tooLong ? c.danger : c.textSoft, textAlign: 'right', paddingRight: 60}]}
          >
            {tooLong ? `Sobran ${text.length - LIMIT} caracteres` : `${text.length} de ${LIMIT}`}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Mensaje propio guardado en el teléfono que aún espera la confirmación del servidor. */
function QueuedBubble({text}: {text: string}) {
  const {c} = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Tú, pendiente de confirmación: ${text}`}
      style={{
        maxWidth: '84%',
        alignSelf: 'flex-end',
        paddingHorizontal: space.md,
        paddingTop: 7,
        paddingBottom: 6,
        borderRadius: radius.bubble,
        backgroundColor: c.bubbleOwn,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: c.outline,
      }}
    >
      <Text style={[type.body, {color: c.text}]}>{text}</Text>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4}}>
        <Icon name="pending" size={14} color={c.onBubbleSoft} />
        <Text style={{fontSize: 12, lineHeight: 16, color: c.onBubbleSoft}}>Pendiente</Text>
      </View>
    </View>
  );
}

/** Mensaje que el servidor rechazó de forma definitiva: nunca se reenvía solo. */
function FailedBubble({
  failed,
  onRecover,
  onDismiss,
}: {
  failed: FailedMessage;
  onRecover: () => void;
  onDismiss: () => void;
}) {
  const {c} = useTheme();
  const reason = explainError(failed.code, failed.reason).title;
  return (
    <View style={{maxWidth: '84%', alignSelf: 'flex-end', gap: space.xs}}>
      <View
        accessible
        accessibilityLabel={`Tú, no enviado: ${failed.text}. ${reason}`}
        style={{
          paddingHorizontal: space.md,
          paddingTop: 7,
          paddingBottom: 6,
          borderRadius: radius.bubble,
          backgroundColor: c.surface,
          borderWidth: 1.5,
          borderColor: c.danger,
        }}
      >
        <Text style={[type.body, {color: c.text}]}>{failed.text}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4}}>
          <Icon name="alert" size={14} color={c.danger} />
          <Text style={{fontSize: 12, lineHeight: 16, color: c.danger, fontWeight: '600'}}>No enviado · {reason}</Text>
        </View>
      </View>
      <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: space.xs}}>
        <Button variant="text" label="Copiar al cuadro" onPress={onRecover} />
        <Button variant="text" label="Descartar" onPress={onDismiss} />
      </View>
    </View>
  );
}

function Bubble({row, showName, now}: {row: Row; showName: boolean; now: Date}) {
  const {c} = useTheme();
  const {message, own, startsDay, startsRun} = row;
  const named = showName && !own && startsRun;
  return (
    <View>
      {startsDay && (
        <View style={{alignItems: 'center', paddingVertical: space.sm}}>
          <Text
            accessibilityRole="header"
            style={[
              type.caption,
              {
                color: c.onBubbleSoft,
                backgroundColor: c.bubbleOther,
                paddingHorizontal: space.md,
                paddingVertical: 4,
                borderRadius: 8,
                overflow: 'hidden',
                fontWeight: '600',
              },
            ]}
          >
            {dayLabel(dayKey(message.createdAt), now).replace(/^./, letter => letter.toUpperCase())}
          </Text>
        </View>
      )}
      {/* Propio y recibido se distinguen por lado, esquina, nombre y palomita, no solo por color. */}
      <View
        accessible
        accessibilityLabel={`${own ? 'Tú' : message.senderName}, ${clock(message.createdAt)}: ${message.text}`}
        style={[
          {
            maxWidth: '84%',
            marginTop: startsRun ? space.sm : 3,
            paddingHorizontal: space.md,
            paddingTop: 7,
            paddingBottom: 6,
            borderRadius: radius.bubble,
            backgroundColor: own ? c.bubbleOwn : c.bubbleOther,
            alignSelf: own ? 'flex-end' : 'flex-start',
          },
          startsRun && (own ? {borderTopRightRadius: 3} : {borderTopLeftRadius: 3}),
        ]}
      >
        {named && (
          <Text numberOfLines={1} style={[type.small, {color: c.primary, fontWeight: '700'}]}>
            {message.senderName}
          </Text>
        )}
        <Text selectable style={[type.body, {color: c.text}]}>
          {message.text}
        </Text>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4}}>
          <Text style={{fontSize: 12, lineHeight: 16, color: c.onBubbleSoft, fontVariant: ['tabular-nums']}}>
            {clock(message.createdAt)}
          </Text>
          {/* Una palomita: guardado por el servidor. No hay datos de lectura, así que no hay doble palomita. */}
          {own && <Icon name="check" size={14} color={c.onBubbleSoft} />}
        </View>
        {/* Cola de la burbuja en el primer mensaje de cada tanda. */}
        {startsRun && (
          <View
            style={[
              {
                position: 'absolute',
                top: 0,
                width: 0,
                height: 0,
                borderTopWidth: 10,
                borderTopColor: own ? c.bubbleOwn : c.bubbleOther,
              },
              own
                ? {right: -7, borderRightWidth: 8, borderRightColor: 'transparent'}
                : {left: -7, borderLeftWidth: 8, borderLeftColor: 'transparent'},
            ]}
          />
        )}
      </View>
    </View>
  );
}

export function Members({id}: {id: string}) {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const conversation = state.conversations.find(item => item.id === id);
  const ownId = state.session?.user.id;
  const creator = !!conversation && conversation.ownerId === ownId;
  const [members, setMembers] = useState<User[] | null>(null);
  const [failed, setFailed] = useState('');
  const [working, setWorking] = useState('');
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<User[] | null>(null);
  const settled = useDebounced(query.trim());
  const name = useRef(conversation?.name ?? '');
  if (conversation) name.current = conversation.name;
  const locked = !state.online || state.busy || state.pending;

  useEffect(() => {
    if (!conversation && state.session && !state.needsLogin)
      nav.home(`Ya no tienes acceso a «${name.current || 'ese grupo'}».`);
  }, [conversation, state.session, state.needsLogin]);

  const load = async () => {
    setFailed('');
    try {
      const result = await engine.query('groups.members', {conversationId: id});
      setMembers(result.members);
    } catch (error) {
      setFailed(explainError((error as {code?: string})?.code ?? '', error instanceof Error ? error.message : '').body);
    }
  };
  useEffect(() => {
    if (state.online) void load();
  }, [id, state.online]);
  useEffect(() => {
    if (!creator || !canSearchDirectory(settled) || !state.online) return setFound(null);
    let cancelled = false;
    engine.query('users.list', {query: settled}).then(
      result => {
        if (!cancelled) setFound(result.users);
      },
      () => {
        if (!cancelled) setFound([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [settled, creator, state.online]);

  const change = async (operation: 'groups.add' | 'groups.remove', user: User) => {
    setWorking(user.id);
    setProblem('');
    try {
      await engine.mutate(operation, {conversationId: id, matricula: user.matricula});
      await load();
    } catch {
      setProblem(
        engine.state.pending
          ? 'El servidor aún no confirma el cambio. Se resolverá al reconectar, sin repetirse.'
          : explainError(engine.state.errorCode, engine.state.error).body,
      );
      engine.clearError();
    } finally {
      setWorking('');
    }
  };
  const confirmRemove = (user: User) =>
    Alert.alert(
      `¿Quitar a ${user.name}?`,
      `Dejará de ver «${name.current}» y no recibirá mensajes nuevos. Lo que ya leyó no se puede retirar.`,
      [
        {text: 'Cancelar', style: 'cancel'},
        {text: 'Quitar del grupo', style: 'destructive', onPress: () => void change('groups.remove', user)},
      ],
    );

  if (!conversation) return <View style={{flex: 1, backgroundColor: c.bg}} />;
  const candidates = found?.filter(user => !members?.some(member => member.id === user.id)) ?? null;
  const full = (members?.length ?? 0) >= 100;

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar title="Integrantes" subtitle={conversation.name} onBack={nav.pop} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{paddingVertical: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.sm}}
      >
        {!!problem && (
          <Notice
            tone={state.pending ? 'warn' : 'error'}
            title={state.pending ? 'Enviado, pendiente de confirmación' : 'No se aplicó el cambio'}
            body={problem}
            onClose={() => setProblem('')}
            style={{marginHorizontal: space.lg}}
          />
        )}
        <View style={{paddingHorizontal: space.lg}}>
          <SectionTitle>{members ? `${members.length} de 100 integrantes` : 'Integrantes'}</SectionTitle>
        </View>
        {failed ? (
          <Notice
            tone="error"
            title="No se pudo cargar la lista"
            body={failed}
            action="Reintentar"
            onAction={() => void load()}
            style={{marginHorizontal: space.lg}}
          />
        ) : !members ? (
          state.online ? (
            <View style={{paddingHorizontal: space.lg}}>
              <SkeletonRows />
            </View>
          ) : (
            <Empty icon="offline" title="Sin conexión" body="La lista de integrantes se consulta en el servidor." />
          )
        ) : (
          members.map(user => {
            const owner = user.id === conversation.ownerId;
            return (
              <PersonRow
                key={user.id}
                name={user.id === ownId ? `${user.name} (tú)` : user.name}
                detail={user.matricula}
                badge={owner ? 'Creó el grupo' : undefined}
                right={
                  creator && !owner ? (
                    working === user.id ? (
                      <ActivityIndicator color={c.primary} style={{width: 48}} />
                    ) : (
                      <IconButton
                        icon="personRemove"
                        label={`Quitar a ${user.name} del grupo`}
                        color={c.danger}
                        disabled={locked}
                        onPress={() => confirmRemove(user)}
                      />
                    )
                  ) : undefined
                }
              />
            );
          })
        )}

        {creator ? (
          <View style={{paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md}}>
            <SectionTitle>Añadir integrantes</SectionTitle>
            {full ? (
              <Text style={[type.small, {color: c.textSoft}]}>El grupo llegó al máximo de 100 integrantes.</Text>
            ) : (
              <Field
                label="Buscar por nombre o matrícula"
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                right={<Icon name="search" size={22} color={c.textSoft} />}
              />
            )}
            {!full && !canSearchDirectory(query) && (
              <Text style={[type.small, {color: c.textSoft}]}>{DIRECTORY_HINT}.</Text>
            )}
            {state.pending && !problem && (
              <Text style={[type.small, {color: c.textSoft}]}>
                Hay un cambio pendiente de confirmar; espera a que se resuelva.
              </Text>
            )}
          </View>
        ) : (
          <View style={{flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.lg}}>
            <Icon name="lock" size={20} color={c.textSoft} />
            <Text style={[type.small, {color: c.textSoft, flex: 1}]}>
              Solo quien creó el grupo puede añadir o quitar integrantes.
            </Text>
          </View>
        )}
        {creator &&
          !full &&
          canSearchDirectory(settled) &&
          (candidates === null ? (
            <View style={{paddingHorizontal: space.lg}}>
              <SkeletonRows count={2} />
            </View>
          ) : !candidates.length ? (
            <Text style={[type.small, {color: c.textSoft, paddingHorizontal: space.lg}]}>
              Nadie más coincide con «{settled}».
            </Text>
          ) : (
            candidates.map(user => (
              <PersonRow
                key={user.id}
                name={user.name}
                detail={user.matricula}
                right={
                  working === user.id ? (
                    <ActivityIndicator color={c.primary} style={{width: 48}} />
                  ) : (
                    <IconButton
                      icon="personAdd"
                      label={`Añadir a ${user.name} al grupo`}
                      color={c.primary}
                      disabled={locked}
                      onPress={() => void change('groups.add', user)}
                    />
                  )
                }
              />
            ))
          ))}
      </ScrollView>
    </View>
  );
}
