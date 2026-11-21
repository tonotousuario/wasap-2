import React, {useRef, useState} from 'react';
import {ScrollView, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {engine} from '../native';
import {explainError} from '../format';
import {useEngine, useNav} from '../ui/app';
import {Button, Field, Notice, TopBar} from '../ui/kit';
import {space, type, useTheme} from '../ui/theme';

/** The server's own message for CONFLICT here (taken matrícula), the general wording otherwise. */
function explain(code: string, message: string) {
  return code === 'CONFLICT' ? {title: 'No se pudo', body: message} : explainError(code, message);
}

const pinProblem = (pin: string, again: string) =>
  !/^\d{6,12}$/.test(pin) ? 'El PIN lleva de 6 a 12 dígitos.' : pin !== again ? 'Los dos PIN no coinciden.' : '';

/** Two PIN fields: the student chooses it; nobody else ever knows it. */
function PinFields({
  pin,
  setPin,
  again,
  setAgain,
  onDone,
}: {
  pin: string;
  setPin: (v: string) => void;
  again: string;
  setAgain: (v: string) => void;
  onDone: () => void;
}) {
  const againRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const digits = (text: string) => text.replace(/\D/g, '').slice(0, 12);
  return (
    <>
      <Field
        label="Elige tu PIN"
        value={pin}
        onChangeText={text => setPin(digits(text))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={12}
        returnKeyType="next"
        onSubmitEditing={() => againRef.current?.focus()}
        submitBehavior="submit"
        help="De 6 a 12 dígitos. Solo tú lo conocerás."
      />
      <Field
        ref={againRef}
        label="Repite tu PIN"
        value={again}
        onChangeText={text => setAgain(digits(text))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={12}
        returnKeyType="done"
        onSubmitEditing={onDone}
      />
    </>
  );
}

/** Personal invitation: the account already has matrícula and name; the student picks the PIN. */
export function Redeem({code}: {code: string}) {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const server = state.servers.find(item => item.id === state.activeServerId);
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<{title: string; body: string} | null>(null);
  const submit = async () => {
    const local = pinProblem(pin, again);
    if (local) return setProblem({title: 'Revisa tu PIN', body: local});
    setProblem(null);
    try {
      await engine.redeemInvitation(code, pin);
      nav.home();
    } catch {
      setProblem(explain(engine.state.errorCode, engine.state.error));
      engine.clearError();
      setPin('');
      setAgain('');
    }
  };
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar title="Tu invitación" subtitle={server?.name} onBack={nav.pop} />
      <ScrollView
        contentContainerStyle={{padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.lg}}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[type.body, {color: c.textSoft}]}>
          Tu profesor ya registró tu matrícula y tu nombre. Solo falta que elijas el PIN con el que entrarás.
        </Text>
        <PinFields pin={pin} setPin={setPin} again={again} setAgain={setAgain} onDone={() => void submit()} />
        {problem && <Notice tone="error" title={problem.title} body={problem.body} />}
        <Button
          large
          label={state.busy ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
          loading={state.busy}
          onPress={() => void submit()}
        />
      </ScrollView>
    </View>
  );
}

/** Self sign-up with a class code; the account waits for the teacher's approval. */
export function Signup({code: initialCode, className}: {code?: string; className?: string}) {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const server = state.servers.find(item => item.id === state.activeServerId);
  const [code, setCode] = useState(initialCode ?? '');
  const [matricula, setMatricula] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<{title: string; body: string} | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const local = !/^[A-Za-z2-9]{8}$/.test(code.trim())
      ? 'El código de clase tiene 8 letras y números.'
      : !matricula.trim()
        ? 'Escribe tu matrícula.'
        : !name.trim()
          ? 'Escribe tu nombre.'
          : pinProblem(pin, again);
    if (local) return setProblem({title: 'Revisa los datos', body: local});
    setProblem(null);
    try {
      await engine.requestSignup(code, matricula, name, pin);
      setSent(true);
    } catch {
      setProblem(explain(engine.state.errorCode, engine.state.error));
      engine.clearError();
    }
  };
  if (sent)
    return (
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <TopBar title="Solicitud enviada" subtitle={server?.name} onBack={nav.home} />
        <View style={{padding: space.xl, gap: space.lg}}>
          <Notice
            tone="ok"
            icon="pending"
            title="Pendiente de aprobación"
            body={`Tu profesor${className ? ` de ${className}` : ''} recibió tu solicitud. Cuando la apruebe, entra con tu matrícula ${matricula.trim().toUpperCase()} y el PIN que elegiste.`}
          />
          <Button label="Ir al acceso" onPress={nav.home} />
        </View>
      </View>
    );
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar
        title={className ? `Registro en ${className}` : 'Registro con código de clase'}
        subtitle={server?.name}
        onBack={nav.pop}
      />
      <ScrollView
        contentContainerStyle={{padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.lg}}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[type.body, {color: c.textSoft}]}>Tu profesor revisará tus datos antes de que puedas entrar.</Text>
        <Field
          label="Código de clase"
          value={code}
          onChangeText={text =>
            setCode(
              text
                .replace(/[^A-Za-z0-9]/g, '')
                .slice(0, 8)
                .toUpperCase(),
            )
          }
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!initialCode}
          maxLength={8}
        />
        <Field
          label="Matrícula"
          value={matricula}
          onChangeText={setMatricula}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Field label="Nombre completo" value={name} onChangeText={setName} autoCapitalize="words" maxLength={120} />
        <PinFields pin={pin} setPin={setPin} again={again} setAgain={setAgain} onDone={() => void submit()} />
        {problem && <Notice tone="error" title={problem.title} body={problem.body} />}
        <Button
          large
          label={state.busy ? 'Enviando…' : 'Enviar solicitud'}
          loading={state.busy}
          onPress={() => void submit()}
        />
      </ScrollView>
    </View>
  );
}
