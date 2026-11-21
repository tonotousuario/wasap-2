import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {initials} from '../format';
import {android, radius, space, TOUCH, type, useTheme} from './theme';

// Un nombre por significado; cada sistema usa su propia familia de iconos.
const ICONS = {
  back: ['arrow-left', 'chevron-back'],
  check: ['check', 'checkmark'],
  pending: ['clock-outline', 'time-outline'],
  enter: ['location-enter', 'enter-outline'],
  exit: ['location-exit', 'exit-outline'],
  unknown: ['help-circle-outline', 'help-circle-outline'],
  send: ['send', 'arrow-up'],
  add: ['plus', 'add'],
  newChat: ['message-plus', 'create-outline'],
  group: ['account-group', 'people'],
  groupAdd: ['account-multiple-plus', 'people-outline'],
  general: ['bullhorn', 'megaphone'],
  person: ['account', 'person'],
  personAdd: ['account-plus', 'person-add-outline'],
  personRemove: ['account-remove-outline', 'person-remove-outline'],
  search: ['magnify', 'search'],
  close: ['close', 'close'],
  forward: ['chevron-right', 'chevron-forward'],
  down: ['chevron-down', 'chevron-down'],
  up: ['chevron-up', 'chevron-up'],
  alert: ['alert-circle-outline', 'alert-circle-outline'],
  offline: ['wifi-off', 'cloud-offline-outline'],
  sync: ['sync', 'sync'],
  refresh: ['refresh', 'refresh'],
  attendance: ['clipboard-check-outline', 'clipboard-outline'],
  attendanceOn: ['clipboard-check', 'clipboard'],
  chats: ['chat-outline', 'chatbubbles-outline'],
  chatsOn: ['chat', 'chatbubbles'],
  settings: ['cog-outline', 'settings-outline'],
  settingsOn: ['cog', 'settings'],
  server: ['server-network', 'server-outline'],
  logout: ['logout', 'exit-outline'],
  selected: ['checkbox-marked-circle', 'checkmark-circle'],
  unselected: ['checkbox-blank-circle-outline', 'ellipse-outline'],
  lock: ['lock-outline', 'lock-closed-outline'],
  calendar: ['calendar-range', 'calendar-outline'],
  qr: ['qrcode-scan', 'qr-code-outline'],
  paste: ['content-paste', 'clipboard-outline'],
  trash: ['delete-outline', 'trash-outline'],
  edit: ['pencil-outline', 'create-outline'],
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({name, size = 24, color}: {name: IconName; size?: number; color: string}) {
  const [material, ion] = ICONS[name];
  return android ? (
    <MaterialCommunityIcons name={material} size={size} color={color} />
  ) : (
    <Ionicons name={ion} size={size} color={color} />
  );
}

type Variant = 'filled' | 'tonal' | 'text' | 'danger';
export function Button({
  label,
  onPress,
  variant = 'filled',
  icon,
  disabled = false,
  loading = false,
  large = false,
  hint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  large?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const {c} = useTheme();
  const off = disabled || loading;
  const colors = {
    filled: [c.primary, c.onPrimary],
    tonal: [c.primarySoft, c.onPrimarySoft],
    text: ['transparent', c.primary],
    danger: ['transparent', c.danger],
  }[variant];
  // Deshabilitado: superficie neutra y texto legible, no un botón desvanecido.
  const [bg, fg] = off && variant !== 'text' && variant !== 'danger' ? [c.neutralSoft, c.textSoft] : colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{disabled: off, busy: loading}}
      disabled={off}
      onPress={onPress}
      android_ripple={{color: variant === 'filled' ? '#FFFFFF44' : c.line}}
      style={({pressed}) => [
        {
          minHeight: large ? 56 : TOUCH,
          borderRadius: large && android ? 28 : radius.button,
          backgroundColor: bg,
          paddingHorizontal: variant === 'text' || variant === 'danger' ? space.md : space.xl,
          paddingVertical: space.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          overflow: 'hidden',
        },
        variant === 'danger' && {borderWidth: 1, borderColor: off ? c.line : c.danger},
        pressed && !android && {opacity: 0.6},
        off && (variant === 'text' || variant === 'danger') && {opacity: 0.5},
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Icon name={icon} size={large ? 24 : 20} color={fg} />
      ) : null}
      <Text style={[large ? type.heading : type.label, {color: fg, textAlign: 'center', flexShrink: 1}]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
}) {
  const {c} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      android_ripple={{color: c.line, borderless: true, radius: 22}}
      style={({pressed}) => [
        {width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center'},
        pressed && !android && {opacity: 0.5},
        disabled && {opacity: 0.4},
      ]}
    >
      <Icon name={icon} color={color} />
    </Pressable>
  );
}

export function Field({
  label,
  help,
  problem,
  right,
  style,
  ...input
}: TextInputProps & {
  label: string;
  help?: string;
  problem?: string;
  right?: React.ReactNode;
  ref?: React.Ref<React.ComponentRef<typeof TextInput>>;
}) {
  const {c} = useTheme();
  const [focused, setFocused] = useState(false);
  const border = problem ? c.danger : focused ? c.primary : c.outline;
  return (
    <View style={{gap: 6}}>
      <Text style={[type.label, {color: c.text}]}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          borderRadius: radius.field,
          borderWidth: focused || problem ? 2 : 1,
          borderColor: border,
          backgroundColor: c.surface,
          paddingHorizontal: focused || problem ? space.md - 1 : space.md,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={problem ?? help}
          placeholderTextColor={c.textSoft}
          selectionColor={c.primary}
          cursorColor={c.primary}
          autoCapitalize="none"
          autoCorrect={false}
          {...input}
          onFocus={event => {
            setFocused(true);
            input.onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            input.onBlur?.(event);
          }}
          style={[type.body, {flex: 1, color: c.text, paddingVertical: 10}, style]}
        />
        {right}
      </View>
      {problem ? (
        <Text accessibilityLiveRegion="polite" style={[type.caption, {color: c.danger}]}>
          {problem}
        </Text>
      ) : help ? (
        <Text style={[type.caption, {color: c.textSoft}]}>{help}</Text>
      ) : null}
    </View>
  );
}

const AVATAR_TONES = [
  ['#CDEFE0', '#07513B'],
  ['#D9E6FF', '#1D3F8A'],
  ['#FFE2C7', '#7A3E00'],
  ['#F1DAF7', '#63257A'],
  ['#FFD9DC', '#8A1F2B'],
  ['#E2EBC9', '#3F5210'],
];
export function Avatar({
  name,
  kind = 'DIRECT',
  size = 48,
}: {
  name: string;
  kind?: 'GENERAL' | 'DIRECT' | 'GROUP';
  size?: number;
}) {
  const {c} = useTheme();
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  const [bg, fg] = kind === 'GENERAL' ? [c.primarySoft, c.onPrimarySoft] : AVATAR_TONES[hash % AVATAR_TONES.length];
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {kind === 'DIRECT' ? (
        <Text allowFontScaling={false} style={{color: fg, fontSize: size * 0.38, fontWeight: '600'}}>
          {initials(name)}
        </Text>
      ) : (
        <Icon name={kind === 'GROUP' ? 'group' : 'general'} size={size * 0.5} color={fg} />
      )}
    </View>
  );
}

/** Sello de confirmación del servidor: la palomita sobre verde brillante. */
export function Seal({size = 24}: {size?: number}) {
  const {c} = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="check" size={size * 0.7} color={c.onBrand} />
    </View>
  );
}

export type Tone = 'error' | 'warn' | 'ok' | 'info';
/** Aviso en línea: icono + título + causa + acción. El tono nunca va solo en el color. */
export function Notice({
  tone,
  icon,
  title,
  body,
  action,
  onAction,
  onClose,
  busy = false,
  style,
}: {
  tone: Tone;
  icon?: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  onClose?: () => void;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const {c} = useTheme();
  const [bg, fg] = {
    error: [c.dangerSoft, c.onDangerSoft],
    warn: [c.warnSoft, c.onWarnSoft],
    ok: [c.primarySoft, c.onPrimarySoft],
    info: [c.neutralSoft, c.text],
  }[tone];
  const glyph = icon ?? ({error: 'alert', warn: 'pending', ok: 'check', info: 'sync'} as const)[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.block,
          paddingLeft: space.lg,
          paddingRight: onClose ? 0 : space.lg,
          paddingVertical: space.md,
          flexDirection: 'row',
          gap: space.md,
          alignItems: 'flex-start',
        },
        style,
      ]}
    >
      <View style={{paddingTop: 2}}>{tone === 'ok' ? <Seal /> : <Icon name={glyph} size={22} color={fg} />}</View>
      <View style={{flex: 1, gap: 2}}>
        <Text style={[type.label, {color: fg}]}>{title}</Text>
        {!!body && <Text style={[type.small, {color: fg}]}>{body}</Text>}
        {!!action && !!onAction && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            accessibilityState={{disabled: busy, busy}}
            disabled={busy}
            onPress={onAction}
            style={{minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', opacity: busy ? 0.6 : 1}}
          >
            <Text style={[type.label, {color: fg, textDecorationLine: 'underline'}]}>{action}</Text>
          </Pressable>
        )}
      </View>
      {!!onClose && <IconButton icon="close" label="Cerrar aviso" color={fg} onPress={onClose} />}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const {c} = useTheme();
  // Área táctil de 48 con una píldora visual más baja, como un chip de filtro.
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{selected, checked: selected, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={{minHeight: TOUCH, justifyContent: 'center', opacity: disabled ? 0.5 : 1}}
    >
      <View
        style={{
          minHeight: 36,
          paddingHorizontal: selected ? space.md : space.lg,
          borderRadius: android ? 8 : 18,
          borderWidth: 1,
          borderColor: selected ? c.primarySoft : c.outline,
          backgroundColor: selected ? c.primarySoft : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {selected && <Icon name="check" size={18} color={c.onPrimarySoft} />}
        <Text style={[type.small, {fontWeight: '600', color: selected ? c.onPrimarySoft : c.text}]}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** Barra superior: verde con título a la izquierda en Android; clara en iPhone. */
export function TopBar({
  title,
  subtitle,
  onBack,
  left,
  right,
  large = false,
  onTitlePress,
  titleHint,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  large?: boolean;
  onTitlePress?: () => void;
  titleHint?: string;
}) {
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const titleBlock = (
    <View style={{flex: 1, justifyContent: 'center', minHeight: TOUCH}}>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={[large ? type.title : type.heading, {color: c.onBar}, large && android && {letterSpacing: 0.5}]}
      >
        {title}
      </Text>
      {!!subtitle && (
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[type.caption, {color: c.onBarSoft}]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
  return (
    <View
      style={{backgroundColor: c.bar, paddingTop: insets.top, borderBottomWidth: android ? 0 : 1, borderColor: c.line}}
    >
      <View
        style={{
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: onBack ? space.xs : space.lg,
          paddingRight: space.xs,
          gap: onBack ? space.xs : space.md,
        }}
      >
        {!!onBack && <IconButton icon="back" label="Volver" color={android ? c.onBar : c.primary} onPress={onBack} />}
        {left}
        {onTitlePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={titleHint}
            onPress={onTitlePress}
            style={{flex: 1}}
          >
            {titleBlock}
          </Pressable>
        ) : (
          titleBlock
        )}
        {right}
      </View>
    </View>
  );
}

export function SectionTitle({children, right}: {children: string; right?: React.ReactNode}) {
  const {c} = useTheme();
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32}}>
      <Text accessibilityRole="header" style={[type.heading, {color: c.text}]}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Empty({
  icon,
  title,
  body,
  children,
}: {
  icon: IconName;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const {c} = useTheme();
  return (
    <View style={{alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.xl}}>
      <Icon name={icon} size={36} color={c.outline} />
      <Text style={[type.heading, {color: c.text, textAlign: 'center'}]}>{title}</Text>
      <Text style={[type.small, {color: c.textSoft, textAlign: 'center'}]}>{body}</Text>
      {children}
    </View>
  );
}

/** Filas fantasma mientras llega la primera respuesta del servidor. */
export function SkeletonRows({count = 3}: {count?: number}) {
  const {c} = useTheme();
  return (
    <View
      accessibilityLabel="Cargando"
      accessibilityRole="progressbar"
      style={{gap: space.lg, paddingVertical: space.md}}
    >
      {Array.from({length: count}, (_, index) => (
        <View key={index} style={{flexDirection: 'row', gap: space.md, alignItems: 'center'}}>
          <View style={{width: 40, height: 40, borderRadius: 20, backgroundColor: c.neutralSoft}} />
          <View style={{flex: 1, gap: 8}}>
            <View style={{height: 12, width: '55%', borderRadius: 6, backgroundColor: c.neutralSoft}} />
            <View style={{height: 10, width: '80%', borderRadius: 5, backgroundColor: c.neutralSoft}} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function PersonRow({
  name,
  detail,
  badge,
  right,
  onPress,
  disabled = false,
  hint,
}: {
  name: string;
  detail: string;
  badge?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  const {c} = useTheme();
  const content = (
    <>
      <Avatar name={name} size={44} />
      <View style={{flex: 1}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap'}}>
          <Text style={[type.body, {color: c.text, fontWeight: '500', flexShrink: 1}]}>{name}</Text>
          {!!badge && (
            <Text
              style={[
                type.caption,
                {
                  color: c.onPrimarySoft,
                  backgroundColor: c.primarySoft,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 6,
                  overflow: 'hidden',
                  fontWeight: '600',
                },
              ]}
            >
              {badge}
            </Text>
          )}
        </View>
        <Text style={[type.small, {color: c.textSoft}]}>{detail}</Text>
      </View>
      {right}
    </>
  );
  const rowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  } as const;
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${detail}`}
      accessibilityHint={hint}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{color: c.line}}
      style={({pressed}) => [rowStyle, pressed && !android && {backgroundColor: c.bgAlt}, disabled && {opacity: 0.5}]}
    >
      {content}
    </Pressable>
  );
}
