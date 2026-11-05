import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

process.env.TZ = 'America/Sao_Paulo';
const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const pure = { exports: {}, Date, Set };
vm.runInNewContext(transpile('../src/lib/workoutFrequency.ts'), pure);
const volume = { exports: {} };
vm.runInNewContext(transpile('../src/lib/workoutSession.ts'), volume);
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const text = node => !node ? '' : ['string', 'number'].includes(typeof node) ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function sessionHarness(componentName) {
  const slots = [], effects = [], timeouts = new Map(), listeners = new Map();
  const calls = { logs: [], progress: [], notices: 0 }, pending = [];
  let cursor = 0, dirty = false, timerId = 0, now = new Date('2026-11-06T01:30:00.000Z').getTime(), cached = [];
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { const next = typeof value === 'function' ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(fn, deps) { const index = cursor++; const previous = slots[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  react.default = react;
  const storage = {
    getUser: () => ({ uid: 'student', name: 'Aluno', role: 'student' }),
    getWorkoutLogs: () => cached,
    getCacheItem: () => null,
    getCustomExercises: () => [],
    saveProgress: async value => { calls.progress.push(value); },
    saveWorkoutLog: value => {
      const snapshot = JSON.parse(JSON.stringify(value)); calls.logs.push(snapshot);
      return new Promise((resolve, reject) => pending.push({ resolve: status => {
        const saved = { ...snapshot, syncStatus: status }; cached = [saved, ...cached.filter(log => log.id !== saved.id)]; resolve(saved);
      }, reject }));
    },
    notifyTrainerWorkoutCompleted: () => { calls.notices++; throw new Error('Notifications must be centralized in persistence'); },
  };
  const events = { addEventListener(name, fn) { const list = listeners.get(name) || new Set(); list.add(fn); listeners.set(name, list); }, removeEventListener(name, fn) { listeners.get(name)?.delete(fn); } };
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, Date: ClockDate, crypto: { randomUUID }, console, URL, Error,
    window: { ...events, location: { origin: 'https://example.test' } }, document: {}, navigator: {},
    setTimeout: fn => { const id = ++timerId; timeouts.set(id, fn); return id; }, clearTimeout: id => timeouts.delete(id),
    setInterval: () => ++timerId, clearInterval() {},
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === '../lib/storage') return { storage };
      if (name === '../lib/workoutFrequency') return pure.exports;
      if (name === '../lib/workoutSession') return volume.exports;
      if (name === '../lib/useWorkoutFrequency') return { useWorkoutFrequency: (uid, month, key, anchor) => {
        const dates = pure.exports.completedWorkoutDates(cached, uid), weekDates = pure.exports.workoutWeekDates(anchor);
        return { dates, weekDates, monthCompletedDays: pure.exports.completedDaysInMonth(dates, month), weekCompletedDays: weekDates.map(day => dates.has(pure.exports.localWorkoutDateKey(day))), loading: false, error: '' };
      } };
      if (name === '../lib/mediaDb') return { useMediaUrl: value => value || '', getCachedVideoBlobUrl: async value => value };
      if (name === '../lib/mediaPresentation') return { isImageMedia: () => false, youtubeVideoId: () => null };
      if (name === '../lib/trainerConfig') return { TRAINER_CONFIG: { phone: '5500000000000' } };
      if (name === 'motion/react') return { motion: new Proxy({}, { get: (_, key) => String(key) }), AnimatePresence: 'AnimatePresence' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (name === 'canvas-confetti') return { default() {} };
      return {};
    },
  };
  vm.runInNewContext(transpile(`../src/components/${componentName}.tsx`), context);
  const exercises = [{ id: 'one', name: 'Agachamento', sets: 3, reps: '10', rest: '45s', currentLoad: 10 }, { id: 'two', name: 'Remada', sets: 3, reps: '10', rest: '45s', currentLoad: 10 }];
  const data = { id: 'routine', name: 'Treino A', studentId: 'student', exercises };
  const props = componentName === 'WorkoutSession' ? { workout: data, onClose() {} } : { routine: data, onClose() {} };
  const render = () => {
    let tree, count = 0;
    do {
      assert.ok(count++ < 20, 'component stabilizes'); dirty = false; cursor = 0;
      tree = context.exports.default(props); effects.splice(0).forEach(effect => effect());
    } while (dirty);
    return tree;
  };
  const button = predicate => {
    const node = all(render()).find(node => node.type === 'button' && predicate(node));
    assert.ok(node, 'button exists'); return node;
  };
  return { render, button, calls, pending, storage,
    cache: logs => { cached = logs; },
    advance: ms => { now += ms; },
    flushTimeouts: () => { const callbacks = [...timeouts.values()]; timeouts.clear(); callbacks.forEach(fn => fn()); },
  };
}

test('WorkoutSession requires explicit full-workout completion; save is locked, retry keeps the ID/time, and RPE edits the same log', async () => {
  const app = sessionHarness('WorkoutSession');
  app.button(node => text(node).includes('Série 1')).props.onClick();
  assert.equal(app.calls.logs.length, 0, 'one checked set is not a completed workout');
  app.button(node => node.props['aria-label'] === 'Próximo exercício').props.onClick();
  assert.equal(app.button(node => node.props['aria-label'] === 'Concluir treino').props.disabled, true);
  app.button(node => text(node) === 'CONCLUIR EXERCÍCIO').props.onClick(); await settle();
  assert.equal(app.calls.logs.length, 0, 'one exercise is not a completed workout');
  assert.equal(app.button(node => node.props['aria-label'] === 'Concluir treino').props.disabled, true);
  app.button(node => all(node).some(child => child.type === 'ChevronLeft')).props.onClick();
  app.button(node => text(node) === 'CONCLUIR EXERCÍCIO').props.onClick(); await settle();
  app.button(node => node.props['aria-label'] === 'Próximo exercício').props.onClick();
  const finish = app.button(node => node.props['aria-label'] === 'Concluir treino');
  assert.equal(finish.props.disabled, false);
  finish.props.onClick(); finish.props.onClick();
  assert.equal(app.calls.logs.length, 1, 'synchronous lock blocks double clicks before rerender');
  assert.equal(app.button(node => node.props['aria-label'] === 'Concluir treino').props.disabled, true);
  app.pending[0].reject(new Error('Sem espaço para salvar localmente')); await settle();
  assert.equal(all(app.render()).some(node => node.props?.role === 'alert' && text(node).includes('Sem espaço')), true);
  app.advance(120_000);
  app.button(node => node.props['aria-label'] === 'Concluir treino').props.onClick();
  assert.equal(app.calls.logs[1].id, app.calls.logs[0].id);
  assert.equal(app.calls.logs[1].completedAt, app.calls.logs[0].completedAt);
  assert.equal(app.calls.logs[1].durationSeconds, app.calls.logs[0].durationSeconds);
  app.pending[1].resolve('pending'); await settle();
  assert.match(text(app.render()), /Salvo neste dispositivo/);
  const stars = all(app.render()).filter(node => node.type === 'button' && all(node).some(child => child.type === 'Star'));
  stars[3].props.onClick(); stars[4].props.onClick();
  assert.equal(app.calls.logs.length, 3, 'RPE update is locked while saving');
  assert.equal(app.calls.logs[2].id, app.calls.logs[0].id);
  assert.equal(app.calls.logs[2].completedAt, app.calls.logs[0].completedAt);
  assert.equal(app.calls.logs[2].rpe, 8);
  app.pending[2].resolve('synced'); await settle();
  assert.equal(app.calls.notices, 0, 'the UI does not send a second notification');
});

test('prescribed workout requires all exercises and confirmation; retry keeps completion date and calendar excludes other students', async () => {
  const app = sessionHarness('AdminWorkoutSession');
  app.cache([{ id: 'foreign', studentId: 'other', completedAt: '2026-11-04T12:00:00Z' }]);
  app.button(node => text(node) === 'INICIAR').props.onClick();
  app.button(node => node.props['aria-label'] === 'Concluir exercício Agachamento').props.onClick();
  app.flushTimeouts(); app.render();
  assert.equal(app.calls.logs.length, 0);
  assert.equal(all(app.render()).some(node => node.type === 'button' && text(node) === 'Concluir'), false);
  app.button(node => node.props['aria-label'] === 'Concluir exercício Remada').props.onClick();
  app.render(); app.flushTimeouts();
  assert.equal(app.calls.logs.length, 0, 'checked exercises still require explicit confirmation');
  const comment = all(app.render()).find(node => node.type === 'textarea');
  comment.props.onChange({ target: { value: 'Treino completo' } });
  const finish = app.button(node => text(node) === 'Concluir');
  const first = finish.props.onClick(); await finish.props.onClick();
  assert.equal(app.calls.logs.length, 1);
  assert.equal(app.button(node => text(node) === 'Salvando...').props.disabled, true);
  app.pending[0].reject(new Error('Falha local')); await first;
  assert.match(text(app.render()), /Falha local/);
  app.advance(4 * 60 * 60 * 1000); // after local midnight
  const retry = app.button(node => text(node) === 'Concluir').props.onClick();
  assert.equal(app.calls.logs[1].id, app.calls.logs[0].id);
  assert.equal(app.calls.logs[1].completedAt, app.calls.logs[0].completedAt);
  assert.equal(app.calls.logs[1].comment, 'Treino completo');
  app.pending[1].resolve('pending'); await retry;
  const tree = app.render();
  assert.match(text(tree), /1 dia essa semana/);
  assert.match(text(tree), /1 dia esse mês/);
  const calendarLabels = all(tree).map(node => node.props?.['aria-label']).filter(Boolean);
  assert.ok(calendarLabels.includes('2026-11-05: treino concluído'));
  assert.ok(calendarLabels.includes('2026-11-04: sem treino registrado'));
  assert.ok(!calendarLabels.includes('2026-11-06: treino concluído'), 'retry after midnight does not invent a new completion day');
  assert.equal(app.calls.notices, 0);
});
