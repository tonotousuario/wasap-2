import {createContext, useContext, useEffect, useState, useSyncExternalStore} from 'react';
import {Keyboard, Platform} from 'react-native';
import {engine} from '../native';
import type {Conversation, User} from '../types';

export type Route =
  | {name: 'thread'; id: string}
  | {name: 'members'; id: string}
  | {name: 'newChat'}
  | {name: 'newGroup'}
  | {name: 'classReport'; id: string}
  | {name: 'server'};
export type Navigation = {
  push(route: Route): void;
  pop(): void;
  replace(route: Route): void;
  home(notice?: string): void;
};
export const Nav = createContext<Navigation>({push() {}, pop() {}, replace() {}, home() {}});
export const useNav = () => useContext(Nav);
export const useEngine = () => useSyncExternalStore(engine.subscribe, engine.snapshot);

/** Ejecuta una operación; el fallo queda en el estado del motor para mostrarse. */
export const run = (task: Promise<unknown>) => {
  void task.catch(error => engine.report(error));
};

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export function useDebounced<T>(value: T, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

// Compatibilidad con servidores sin Conversation.peer; solo en memoria.
const peers = new Map<string, string>();
const peerListeners = new Set<() => void>();
const asked = new Set<string>();
let peerVersion = 0;
const peerChanged = () => {
  peerVersion++;
  peerListeners.forEach(listener => listener());
};
export function rememberPeer(conversationId: string, name: string) {
  if (peers.get(conversationId) === name) return;
  peers.set(conversationId, name);
  peerChanged();
}
export function forgetLocalData() {
  peers.clear();
  asked.clear();
  drafts.clear();
  peerChanged();
}
export function usePeers(conversations: Conversation[], online: boolean) {
  useSyncExternalStore(
    listener => {
      peerListeners.add(listener);
      return () => {
        peerListeners.delete(listener);
      };
    },
    () => peerVersion,
  );
  const missing = conversations
    .filter(c => c.kind === 'DIRECT' && !c.peer && !peers.has(c.id) && !asked.has(c.id))
    .map(c => c.id)
    .join(',');
  useEffect(() => {
    if (!online || !missing) return;
    let cancelled = false;
    void (async () => {
      for (const id of missing.split(',')) {
        if (cancelled || asked.has(id)) continue;
        asked.add(id);
        try {
          const result = await engine.query('groups.members', {conversationId: id});
          const other = (result.members as User[]).find(member => member.id !== engine.state.session?.user.id);
          if (other) rememberPeer(id, other.name);
        } catch {
          // Sin respuesta: la lista usa el nombre de los mensajes recibidos.
          asked.delete(id);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, missing]);
  return peers;
}

/** Borradores por conversación: sobreviven a salir del chat y a fallos de envío. */
export const drafts = new Map<string, string>();
