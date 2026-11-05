import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

process.env.TZ = 'America/Sao_Paulo';
const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const pure = { exports: {}, Date, Set };
vm.runInNewContext(transpile('../src/lib/workoutFrequency.ts'), pure);
const { localWorkoutDateKey, completedWorkoutDates, workoutWeekDates, completedDaysInMonth, workoutFrequencyRange } = pure.exports;
const log = (id, studentId, completedAt) => ({ id, studentId, completedAt });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('frequency counts real completed logs for the selected student on the local day, once per day', () => {
  const dates = completedWorkoutDates([
    log('late', 'a', '2026-11-06T01:30:00.000Z'), // Nov 5, 22:30 locally
    log('same-day', 'a', '2026-11-05T12:30:00.000Z'),
    log('next-day', 'a', '2026-11-06T03:01:00.000Z'),
    log('other-person', 'b', '2026-11-07T15:00:00.000Z'),
    log('invalid', 'a', 'invalid'),
    { id: 'progress-only', studentId: 'a', date: '2026-11-08T15:00:00.000Z' },
  ], 'a');
  assert.deepEqual([...dates], ['2026-11-05', '2026-11-06']);
  assert.deepEqual([...completedDaysInMonth(dates, new Date(2026, 10, 1))], [5, 6]);
  assert.equal(completedWorkoutDates([], 'a').size, 0, 'today is never invented');
  assert.equal(completedWorkoutDates([log('late', 'a', '2026-11-06T01:30:00.000Z')], undefined).size, 0);
  assert.equal(localWorkoutDateKey('2026-11-05'), '2026-11-05');
  assert.equal(localWorkoutDateKey('2026-02-30'), null);
});

test('Monday-first week and inclusive-start/exclusive-end range cross month and year locally', () => {
  const anchor = new Date(2027, 0, 3, 21);
  assert.deepEqual([...workoutWeekDates(anchor)].map(localWorkoutDateKey), [
    '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
  ]);
  const range = workoutFrequencyRange(new Date(2027, 0, 1), anchor);
  assert.equal(range.from, '2026-12-28T03:00:00.000Z');
  assert.equal(range.to, '2027-02-01T03:00:00.000Z');
});

function frequencyHarness() {
  const slots = [], effects = [], listeners = new Map(), pending = [];
  let cursor = 0, dirty = false, actor = 'a', student = 'a', month = new Date(2026, 10, 1), refreshKey = false, cached = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { const next = typeof value === 'function' ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const events = {
    addEventListener(name, fn) { const list = listeners.get(name) || new Set(); list.add(fn); listeners.set(name, list); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    setTimeout: () => 0, clearTimeout() {},
  };
  const storage = {
    getUser: () => ({ uid: actor }), getWorkoutLogs: () => cached,
    fetchWorkoutLogs: (studentId, range) => new Promise((resolve, reject) => pending.push({ studentId, range, resolve, reject })),
  };
  const context = { exports: {}, Date, window: events, document: { ...events, visibilityState: 'visible' }, require(name) {
    if (name === 'react') return react;
    if (name === './storage') return { storage };
    if (name === './workoutFrequency') return pure.exports;
    throw Error(name);
  } };
  vm.runInNewContext(transpile('../src/lib/useWorkoutFrequency.ts'), context);
  const render = () => {
    let result, attempts = 0;
    do {
      assert.ok(attempts++ < 10, 'hook stabilizes'); dirty = false; cursor = 0;
      result = context.exports.useWorkoutFrequency(student, month, refreshKey, new Date(2026, 10, 5));
      effects.splice(0).forEach(effect => effect());
    } while (dirty);
    return result;
  };
  return { render, pending,
    cache: logs => { cached = logs; },
    switchAccount: uid => { actor = uid; student = uid; },
    month: value => { month = value; },
    reopen: () => { refreshKey = !refreshKey; },
    emit: name => { for (const fn of [...(listeners.get(name) || [])]) fn(); },
  };
}

test('completion event updates immediately; late requests cannot overwrite a newer completion or another account', async () => {
  const app = frequencyHarness();
  app.cache([log('foreign', 'b', '2026-11-04T12:00:00Z')]);
  assert.equal(app.render().dates.size, 0);
  assert.equal(app.pending[0].range.allowCached, false);
  app.cache([log('new', 'a', '2026-11-05T12:00:00Z'), log('foreign', 'b', '2026-11-04T12:00:00Z')]);
  app.emit('cadu_workout_completed');
  assert.deepEqual([...app.render().dates], ['2026-11-05']);
  app.pending[0].resolve([]); await settle();
  assert.deepEqual([...app.render().dates], ['2026-11-05']);
  app.switchAccount('b');
  assert.deepEqual([...app.render().dates], ['2026-11-04']);
  app.pending[1].resolve([log('new', 'a', '2026-11-05T12:00:00Z')]); await settle();
  assert.deepEqual([...app.render().dates], ['2026-11-04']);
  app.pending.at(-1).reject(new Error('offline')); await settle();
  assert.match(app.render().error, /Não foi possível atualizar/);
});

test('changing month, reopening calendar, synchronization and browser return refresh the history', () => {
  const app = frequencyHarness(); app.render();
  app.month(new Date(2026, 8, 1)); app.render();
  assert.equal(app.pending.at(-1).range.from, '2026-09-01T03:00:00.000Z');
  app.reopen(); app.render();
  app.emit('cadu_data_synced'); app.render();
  app.emit('focus'); app.render();
  assert.equal(app.pending.length, 5);
});
