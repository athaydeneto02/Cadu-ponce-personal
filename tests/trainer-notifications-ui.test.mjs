import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/lib/useTrainerNotifications.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'ui-services', setup(builder) {
    builder.onResolve({ filter: /^(react|\.\/storage|\.\/supabase)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'react'
      ? 'export const {useState,useEffect,useRef,useCallback} = globalThis.testReact;'
      : path === './storage' ? 'export const storage = globalThis.testStorage;' : 'export const supabase = globalThis.testSupabase;', loader: 'js' }));
  } }],
});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const notification = id => ({ id, studentName: 'Aluno', workoutTitle: 'Treino', type: 'completion', isRead: false, fullDate: '2026-11-05T12:00:00Z' });
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

function harness() {
  let rows = [notification('old')], readGate = null, fetchCount = 0;
  const callbacks = new Map(), effects = [], state = [], newItems = [], reads = [];
  const timers = new Map();
  let cursor = 0, first = true, realtime;
  const react = {
    useState(initial) { const index = cursor++; if (first) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (first) state[index] = { current: initial }; return state[index]; },
    useEffect(effect) { if (first) effects.push(effect); }, useCallback: fn => fn,
  };
  const target = { addEventListener(name, fn) { callbacks.set(name, fn); }, removeEventListener(name) { callbacks.delete(name); } };
  const channel = { on(_event, options, handler) { assert.equal(options.table, 'workout_completion_notifications'); assert.equal(options.filter, 'recipient_id=eq.admin-a'); realtime = handler; return this; }, subscribe() { return this; } };
  const context = { module: { exports: {} }, testReact: react, console,
    testStorage: {
      getUser: () => ({ uid: 'admin-a' }),
      fetchTrainerNotifications: async () => { fetchCount++; return structuredClone(rows); },
      markTrainerNotificationRead: async id => { reads.push(id); if (readGate) await readGate.promise; rows = rows.map(row => row.id === id ? { ...row, isRead: true } : row); },
    },
    testSupabase: { channel: () => channel, removeChannel: async () => {} },
    window: target, document: { ...target, visibilityState: 'visible' },
    setInterval: handler => { const id = timers.size; timers.set(id, handler); return id; }, clearInterval: id => timers.delete(id),
  };
  context.exports = context.module.exports;
  vm.runInNewContext(compiled.outputFiles[0].text, context);
  const render = () => { cursor = 0; const value = context.module.exports.useTrainerNotifications(items => newItems.push(...items)); first = false; return value; };
  render();
  const cleanups = effects.map(effect => effect());
  return { render, reads, newItems, timers, setRows: value => { rows = value; }, setGate: value => { readGate = value; }, fetches: () => fetchCount,
    realtime: () => realtime(), event: name => callbacks.get(name)?.(), close: () => cleanups.forEach(fn => fn?.()) };
}

test('an open notification feed updates through realtime, reconnect and polling without duplicate banners', async () => {
  const app = harness();
  await settle();
  assert.equal(app.render().items.length, 1);
  assert.equal(app.newItems.length, 0);
  app.setRows([notification('new'), notification('old')]);
  app.realtime(); await settle();
  assert.equal(app.render().items.length, 2);
  app.event('online'); app.event('focus'); app.timers.values().next().value();
  await settle();
  assert.equal(app.newItems.length, 1);
  assert.equal(app.newItems[0].id, 'new');
  assert.ok(app.fetches() >= 3);
  app.close();
  assert.equal(app.timers.size, 0);
});

test('read status waits for server confirmation and failures leave the notification unread', async () => {
  const app = harness();
  await settle();
  const gate = deferred(); app.setGate(gate);
  const marking = app.render().markRead(['old']);
  assert.equal(app.render().items[0].isRead, false);
  assert.equal(app.render().busy, true);
  gate.reject(new Error('Denied'));
  await assert.rejects(marking, /Denied/);
  assert.equal(app.render().items[0].isRead, false);
  assert.match(app.render().error, /não confirmadas permanecem pendentes/);
  app.setGate(null);
  await app.render().markRead(['old']);
  assert.equal(app.render().items[0].isRead, true);
  assert.equal(app.render().busy, false);
  assert.equal(app.render().error, '');
  app.close();
});

test('server-confirmed reads remain read if a delayed polling snapshot is older', async () => {
  const app = harness();
  await settle();
  await app.render().markRead(['old']);
  app.setRows([notification('old')]);
  app.realtime(); await settle();
  assert.equal(app.render().items[0].isRead, true);
  assert.equal(app.newItems.length, 0);
  app.close();
});
