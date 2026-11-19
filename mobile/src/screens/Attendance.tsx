import React, {useEffect, useState} from 'react';
import {RefreshControl, ScrollView, Text, View} from 'react-native';
import {engine} from '../native';
import {
  clock,
  customRange,
  dayLabel,
  displayDate,
  explainError,
  groupByDay,
  maskDate,
  momentLabel,
  pendingLabel,
  presetRange,
  type RangePreset,
} from '../format';
import type {AttendanceEvent, ReportEvent} from '../types';
import type {SignupRequest} from '../engine';
import {run, useEngine, useNav} from '../ui/app';
import {
  Button,
  Chip,
  Empty,
  Field,
  Icon,
  Notice,
  SectionTitle,
  SkeletonRows,
  Seal,
  TopBar,
  type IconName,
} from '../ui/kit';
import {radius, space, type, useTheme} from '../ui/theme';

const NAME = {ENTRY: 'Entrada', EXIT: 'Salida'} as const;
type Outcome = {ok: true; event: AttendanceEvent} | {ok: false; title: string; body: string} | null;

export function Attendance() {
  const state = useEngine();
  const {c} = useTheme();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [marking, setMarking] = useState(false);
  const attendance = state.attendance;
  const now = attendance?.today ?? new Date();
  const timezone = attendance?.timezone;
  const last = attendance?.lastEvent ?? null;
  const next = attendance?.nextType;
  const awaitingMark = state.pending && state.pendingType === 'attendance.mark';
  const nav = useNav();
  const selectedClass = state.classes.find(item => item.id === state.attendanceClassId) ?? null;
  const canReport = !!selectedClass && (selectedClass.isOwner || state.session?.user.role === 'admin');

  const mark = async () => {
    setOutcome(null);
    setMarking(true);
    try {
      // La confirmación solo se muestra con la respuesta del servidor.
      const result = await engine.markAttendance();
      setOutcome({ok: true, event: result.event});
    } catch (error) {
      // Con el envío en el diario no sabemos el resultado: lo cubre el aviso de pendiente.
      if (!engine.state.pending) setOutcome({ok: false, ...explainError(engine.state.errorCode, engine.state.error)});
      engine.clearError();
    } finally {
      setMarking(false);
    }
  };

  const inside = next === 'EXIT';
  const hero: {icon: IconName; word: string; line: string} = !attendance
    ? {
        icon: 'unknown',
        word: 'Sin datos',
        line: state.online
          ? 'Consultando tu estado en el servidor…'
          : 'No hemos podido consultar tu estado. No asumimos que estés fuera.',
      }
    : !last
      ? {icon: 'attendance', word: 'Sin registros', line: 'Todavía no has registrado tu primera entrada.'}
      : {
          icon: inside ? 'enter' : 'exit',
          word: inside ? 'Dentro' : 'Fuera',
          line: `${NAME[last.type]} · ${momentLabel(last.recordedAt, now, timezone)}`,
        };
  // El verde profundo queda para la barra y la acción; el estado usa una superficie tonal.
  const confirmedInside = !!attendance && !!last && inside;
  const heroBg = !attendance ? 'transparent' : confirmedInside ? c.primarySoft : c.neutralSoft;
  const heroFg = confirmedInside ? c.onPrimarySoft : c.text;
  const heroSoft = confirmedInside ? c.onPrimarySoft : c.textSoft;

  const blocked = !state.online
    ? 'Sin conexión. Podrás registrar cuando vuelva.'
    : state.pending && !awaitingMark
      ? `${pendingLabel(state.pendingCount, state.pendingType)}. Podrás registrar en cuanto se resuelva.`
      : '';

  return (
    <ScrollView
      style={{flex: 1, backgroundColor: c.bg}}
      contentContainerStyle={{padding: space.lg, paddingBottom: space.xxl, gap: space.lg}}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={false}
          enabled={state.online && !state.busy}
          onRefresh={() => run(engine.refresh())}
          colors={[c.primary]}
          tintColor={c.primary}
        />
      }
    >
      {!!state.classes.length && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="radiogroup"
          accessibilityLabel="Dónde registrar"
          contentContainerStyle={{gap: space.sm, paddingRight: space.lg}}
          style={{marginHorizontal: -space.lg, paddingLeft: space.lg}}
        >
          <Chip
            label="General"
            selected={!state.attendanceClassId}
            disabled={!state.online || marking}
            onPress={() => run(engine.selectAttendanceClass(null))}
          />
          {state.classes.map(item => (
            <Chip
              key={item.id}
              label={item.name}
              selected={state.attendanceClassId === item.id}
              disabled={!state.online || marking}
              onPress={() => run(engine.selectAttendanceClass(item.id))}
            />
          ))}
        </ScrollView>
      )}
      <View
        accessible
        accessibilityLabel={`Estado${selectedClass ? ` en ${selectedClass.name}` : ''}: ${hero.word}. ${hero.line}`}
        style={{
          backgroundColor: heroBg,
          borderRadius: 20,
          padding: space.xl,
          gap: space.xs,
          borderWidth: attendance ? 0 : 2,
          borderStyle: 'dashed',
          borderColor: c.outline,
        }}
      >
        <View style={{flexDirection: 'row', alignItems: 'center', gap: space.md}}>
          {confirmedInside ? <Seal size={36} /> : <Icon name={hero.icon} size={36} color={heroFg} />}
          <Text style={[type.display, {color: heroFg, flexShrink: 1}]}>{hero.word}</Text>
        </View>
        {!!selectedClass && (
          <Text style={[type.small, {color: heroSoft, fontWeight: '600'}]}>Clase · {selectedClass.name}</Text>
        )}
        <Text style={[type.body, {color: heroSoft}]}>{hero.line}</Text>
        {!!last && (
          <Text style={[type.caption, {color: heroSoft}]}>Hora del servidor. Tu estado continúa de un día a otro.</Text>
        )}
      </View>

      {awaitingMark ? (
        <Notice
          tone="warn"
          icon="pending"
          title="Enviado, pendiente de confirmación"
          body="Tu registro salió del teléfono pero el servidor aún no responde. Al reconectar se confirma solo y no se duplica."
          action="Comprobar ahora"
          busy={state.busy}
          onAction={() => run(engine.reconnect())}
        />
      ) : (
        <View style={{gap: space.sm}}>
          <Button
            large
            icon={next === 'EXIT' ? 'exit' : 'enter'}
            label={
              marking
                ? 'Enviando…'
                : next === 'EXIT'
                  ? 'Registrar salida'
                  : next === 'ENTRY'
                    ? 'Registrar entrada'
                    : 'Registrar asistencia'
            }
            loading={marking}
            disabled={!attendance || !state.online || state.busy || state.pending}
            onPress={() => void mark()}
            hint={blocked || undefined}
          />
          {!!blocked && <Text style={[type.small, {color: c.textSoft, textAlign: 'center'}]}>{blocked}</Text>}
          {!attendance && state.online && !state.busy && (
            <Button variant="text" icon="refresh" label="Consultar mi estado" onPress={() => run(engine.refresh())} />
          )}
          {canReport && (
            <Button
              variant="tonal"
              icon="attendance"
              label="Lista de la clase"
              disabled={!state.online}
              onPress={() => nav.push({name: 'classReport', id: selectedClass!.id})}
            />
          )}
        </View>
      )}

      {outcome?.ok && (
        <Notice
          tone="ok"
          icon="check"
          title={`${NAME[outcome.event.type]} registrada a las ${clock(outcome.event.recordedAt, timezone)}`}
          body="Confirmado por el servidor."
          onClose={() => setOutcome(null)}
        />
      )}
      {outcome && !outcome.ok && (
        <Notice
          tone="error"
          title="No registrado"
          body={`${outcome.title}. ${outcome.body}`}
          onClose={() => setOutcome(null)}
        />
      )}

      {/* Sin ningún registro todavía, el bloque de estado ya lo dice todo. */}
      {(!attendance ||
        !!last ||
        !!state.events.length ||
        !!state.attendanceFilters.from ||
        !!state.attendanceFilters.to) && <History />}
    </ScrollView>
  );
}

const PRESETS: {id: RangePreset; label: string}[] = [
  {id: 'all', label: 'Todo'},
  {id: 'today', label: 'Hoy'},
  {id: 'week', label: '7 días'},
  {id: 'month', label: 'Este mes'},
];

function History() {
  const state = useEngine();
  const {c} = useTheme();
  const now = state.attendance?.today ?? new Date();
  const timezone = state.attendance?.timezone;
  const active = state.attendanceFilters;
  const [choice, setChoice] = useState<RangePreset | 'custom'>(active.from || active.to ? 'custom' : 'all');
  const [from, setFrom] = useState(active.from ? displayDate(active.from) : '');
  const [to, setTo] = useState(active.to ? displayDate(active.to) : '');
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(false);
  const canLoad = state.online && !loading;

  const load = async (task: Promise<unknown>) => {
    setLoading(true);
    try {
      await task;
    } catch (error) {
      engine.report(error);
    } finally {
      setLoading(false);
    }
  };
  const pick = (preset: RangePreset) => {
    setChoice(preset);
    setProblem('');
    void load(engine.loadAttendancePreset(preset));
  };
  const applyCustom = () => {
    const range = customRange(from, to);
    if ('problem' in range) return setProblem(range.problem);
    setProblem('');
    void load(engine.loadAttendance(false, range.filters));
  };
  const summary =
    active.from && active.to
      ? active.from === active.to
        ? `Solo el ${displayDate(active.from)}`
        : `Del ${displayDate(active.from)} al ${displayDate(active.to)}`
      : active.from
        ? `Desde el ${displayDate(active.from)}`
        : active.to
          ? `Hasta el ${displayDate(active.to)}`
          : '';
  const groups = groupByDay(state.events, event => event.recordedAt, timezone);
  const firstLoad = !state.attendance && state.busy && !state.events.length;

  return (
    <View style={{gap: space.md, paddingTop: space.sm}}>
      <SectionTitle>Historial</SectionTitle>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel="Periodo del historial"
        contentContainerStyle={{gap: space.sm, paddingRight: space.lg}}
        style={{marginHorizontal: -space.lg, paddingLeft: space.lg}}
        keyboardShouldPersistTaps="handled"
      >
        {PRESETS.map(preset => (
          <Chip
            key={preset.id}
            label={preset.label}
            selected={choice === preset.id}
            disabled={!state.online}
            onPress={() => pick(preset.id)}
          />
        ))}
        <Chip
          label="Elegir fechas"
          selected={choice === 'custom'}
          onPress={() => {
            setChoice('custom');
            setProblem('');
          }}
        />
      </ScrollView>

      {choice === 'custom' && (
        <View style={{gap: space.md, backgroundColor: c.bgAlt, borderRadius: radius.block, padding: space.lg}}>
          <View style={{flexDirection: 'row', gap: space.md}}>
            <View style={{flex: 1}}>
              <Field
                label="Desde"
                value={from}
                onChangeText={text => setFrom(maskDate(text))}
                keyboardType="number-pad"
                maxLength={10}
                placeholder="dd/mm/aaaa"
              />
            </View>
            <View style={{flex: 1}}>
              <Field
                label="Hasta"
                value={to}
                onChangeText={text => setTo(maskDate(text))}
                keyboardType="number-pad"
                maxLength={10}
                placeholder="dd/mm/aaaa"
              />
            </View>
          </View>
          {!!problem && (
            <Text accessibilityRole="alert" style={[type.small, {color: c.danger}]}>
              {problem}
            </Text>
          )}
          <Button
            variant="tonal"
            icon="calendar"
            label="Ver este periodo"
            loading={loading}
            disabled={!state.online}
            onPress={applyCustom}
          />
        </View>
      )}
      {!!summary && <Text style={[type.small, {color: c.textSoft}]}>{summary}. Ambos días incluidos.</Text>}

      {firstLoad || (loading && !state.events.length) ? (
        <SkeletonRows />
      ) : !groups.length ? (
        <Empty
          icon="attendance"
          title={summary ? 'Sin registros en este periodo' : 'Aún no hay registros'}
          body={
            summary
              ? 'Prueba con otras fechas o vuelve a «Todo».'
              : 'Aquí aparecerán tus entradas y salidas, agrupadas por día.'
          }
        />
      ) : (
        groups.map(group => (
          <View key={group.key} style={{gap: 2}}>
            <Text
              accessibilityRole="header"
              style={[
                type.small,
                {color: c.textSoft, fontWeight: '600', paddingTop: space.sm, paddingBottom: space.xs},
              ]}
            >
              {dayLabel(group.key, now).replace(/^./, letter => letter.toUpperCase())}
            </Text>
            {group.items.map((event, index) => (
              <View
                key={event.id}
                accessible
                accessibilityLabel={`${NAME[event.type]} a las ${clock(event.recordedAt, timezone)}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  minHeight: 48,
                  borderTopWidth: index ? 1 : 0,
                  borderColor: c.line,
                }}
              >
                <Icon
                  name={event.type === 'ENTRY' ? 'enter' : 'exit'}
                  size={22}
                  color={event.type === 'ENTRY' ? c.primary : c.textSoft}
                />
                <Text style={[type.body, {color: c.text, flex: 1}]}>{NAME[event.type]}</Text>
                <Text style={[type.body, {color: c.text, fontVariant: ['tabular-nums']}]}>
                  {clock(event.recordedAt, timezone)}
                </Text>
              </View>
            ))}
          </View>
        ))
      )}
      {!!state.attendanceCursor && (
        <Button
          variant="tonal"
          label="Ver registros anteriores"
          loading={loading && !!state.events.length}
          disabled={!canLoad}
          onPress={() => void load(engine.loadAttendance(true))}
        />
      )}
    </View>
  );
}

const REPORT_PRESETS: {id: RangePreset; label: string}[] = [
  {id: 'today', label: 'Hoy'},
  {id: 'week', label: '7 días'},
  {id: 'month', label: 'Este mes'},
  {id: 'all', label: 'Todo'},
];

/** Movements of every member of a class, for its teacher or an admin. */
export function ClassReport({id}: {id: string}) {
  const state = useEngine();
  const nav = useNav();
  const {c} = useTheme();
  const info = state.classes.find(item => item.id === id);
  const now = state.attendance?.today ?? new Date();
  const timezone = state.attendance?.timezone;
  const [preset, setPreset] = useState<RangePreset>('today');
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');

  const load = async (older: boolean, range = presetRange(preset, now)) => {
    setLoading(true);
    setProblem('');
    try {
      const page = await engine.classReport(id, range, older ? cursor : null);
      setEvents(list => (older ? [...list, ...page.events] : page.events));
      setCursor(page.nextCursor);
    } catch (error) {
      engine.report(error);
      setProblem(explainError(engine.state.errorCode, engine.state.error).body);
      engine.clearError();
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const pick = (next: RangePreset) => {
    setPreset(next);
    setEvents([]);
    void load(false, presetRange(next, now));
  };
  const inside = new Set<string>();
  const seen = new Set<string>();
  // Newest first: the first movement seen per student is their current state.
  for (const event of events) {
    if (seen.has(event.matricula)) continue;
    seen.add(event.matricula);
    if (event.type === 'ENTRY') inside.add(event.matricula);
  }
  const groups = groupByDay(events, event => event.recordedAt, timezone);

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <TopBar title="Lista de la clase" subtitle={info?.name} onBack={nav.pop} />
      <ScrollView contentContainerStyle={{padding: space.lg, paddingBottom: space.xxl, gap: space.md}}>
        <Enrollment classId={id} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="radiogroup"
          accessibilityLabel="Periodo de la lista"
          contentContainerStyle={{gap: space.sm, paddingRight: space.lg}}
          style={{marginHorizontal: -space.lg, paddingLeft: space.lg}}
        >
          {REPORT_PRESETS.map(item => (
            <Chip
              key={item.id}
              label={item.label}
              selected={preset === item.id}
              disabled={!state.online || loading}
              onPress={() => pick(item.id)}
            />
          ))}
        </ScrollView>
        {!!events.length && (
          <Text style={[type.body, {color: c.text}]}>
            {seen.size} {seen.size === 1 ? 'integrante registró' : 'integrantes registraron'} movimientos ·{' '}
            {inside.size} {inside.size === 1 ? 'sigue dentro' : 'siguen dentro'}
          </Text>
        )}
        {!!problem && <Notice tone="error" title="No se pudo cargar la lista" body={problem} />}
        {loading && !events.length ? (
          <SkeletonRows />
        ) : !groups.length ? (
          !problem && (
            <Empty
              icon="attendance"
              title="Sin registros en este periodo"
              body="Cuando tus estudiantes registren entrada o salida en esta clase, aparecerán aquí."
            />
          )
        ) : (
          groups.map(group => (
            <View key={group.key} style={{gap: 2}}>
              <Text
                accessibilityRole="header"
                style={[
                  type.small,
                  {color: c.textSoft, fontWeight: '600', paddingTop: space.sm, paddingBottom: space.xs},
                ]}
              >
                {dayLabel(group.key, now).replace(/^./, letter => letter.toUpperCase())}
              </Text>
              {group.items.map((event, index) => (
                <View
                  key={event.id}
                  accessible
                  accessibilityLabel={`${event.name}, ${NAME[event.type]} a las ${clock(event.recordedAt, timezone)}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    minHeight: 56,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: c.line,
                  }}
                >
                  <Icon
                    name={event.type === 'ENTRY' ? 'enter' : 'exit'}
                    size={22}
                    color={event.type === 'ENTRY' ? c.primary : c.textSoft}
                  />
                  <View style={{flex: 1}}>
                    <Text style={[type.body, {color: c.text}]} numberOfLines={1}>
                      {event.name}
                    </Text>
                    <Text style={[type.small, {color: c.textSoft}]}>
                      {event.matricula} · {NAME[event.type]}
                    </Text>
                  </View>
                  <Text style={[type.body, {color: c.text, fontVariant: ['tabular-nums']}]}>
                    {clock(event.recordedAt, timezone)}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
        {!!cursor && (
          <Button
            variant="tonal"
            label="Ver registros anteriores"
            loading={loading && !!events.length}
            disabled={!state.online || loading}
            onPress={() => void load(true)}
          />
        )}
      </ScrollView>
    </View>
  );
}

/** Teacher tools for a class: its sign-up code and the requests waiting for approval. */
function Enrollment({classId}: {classId: string}) {
  const state = useEngine();
  const {c} = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    setProblem('');
    try {
      await task();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      engine.clearError();
    } finally {
      setBusy('');
    }
  };
  const reload = () => engine.signupRequests(classId).then(setRequests);
  useEffect(() => {
    if (!state.online) return;
    void engine
      .classCode(classId)
      .then(result => setCode(result.code))
      .catch(() => setCode(null));
    void reload().catch(() => {});
    // signupVersion: a new request arrived or another device decided one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, state.online, state.signupVersion]);
  return (
    <View style={{gap: space.md, backgroundColor: c.bgAlt, borderRadius: radius.block, padding: space.lg}}>
      <Text style={[type.small, {color: c.textSoft, fontWeight: '600'}]}>Código de autorregistro</Text>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: space.md}}>
        <Text
          selectable
          accessibilityLabel={code ? `Código ${code.split('').join(' ')}` : 'Sin código'}
          style={{
            flex: 1,
            fontSize: 30,
            fontWeight: '700',
            letterSpacing: 4,
            color: c.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {code ?? '— — — —'}
        </Text>
        <Button
          variant="text"
          icon="refresh"
          label="Renovar"
          loading={busy === 'renew'}
          disabled={!state.online || !!busy}
          onPress={() => void run('renew', async () => setCode((await engine.classCode(classId, true)).code))}
        />
      </View>
      <Text style={[type.small, {color: c.textSoft}]}>
        Díctalo o escríbelo en el pizarrón: con él, tus estudiantes piden entrar desde «Soy nuevo». Renovarlo invalida
        el anterior.
      </Text>
      {!!problem && <Notice tone="error" title="No se pudo" body={problem} onClose={() => setProblem('')} />}
      {!!requests.length && (
        <View style={{gap: space.sm, paddingTop: space.sm}}>
          <Text accessibilityRole="header" style={[type.small, {color: c.textSoft, fontWeight: '600'}]}>
            {requests.length === 1 ? '1 solicitud pendiente' : `${requests.length} solicitudes pendientes`}
          </Text>
          {requests.map(request => (
            <View
              key={request.matricula}
              style={{gap: space.xs, borderTopWidth: 1, borderColor: c.line, paddingTop: space.sm}}
            >
              <Text style={[type.body, {color: c.text}]}>{request.name}</Text>
              <Text style={[type.small, {color: c.textSoft}]}>{request.matricula}</Text>
              <View style={{flexDirection: 'row', gap: space.sm}}>
                <View style={{flex: 1}}>
                  <Button
                    variant="tonal"
                    label="Aprobar"
                    loading={busy === 'approve:' + request.matricula}
                    disabled={!state.online || !!busy}
                    onPress={() =>
                      void run('approve:' + request.matricula, async () => {
                        await engine.decideSignup(request.matricula, true);
                        await reload();
                      })
                    }
                  />
                </View>
                <View style={{flex: 1}}>
                  <Button
                    variant="text"
                    label="Rechazar"
                    loading={busy === 'reject:' + request.matricula}
                    disabled={!state.online || !!busy}
                    onPress={() =>
                      void run('reject:' + request.matricula, async () => {
                        await engine.decideSignup(request.matricula, false);
                        await reload();
                      })
                    }
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
