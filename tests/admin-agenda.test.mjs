import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/AdminAgenda.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

const nodes = item => !item || typeof item !== 'object' ? [] : Array.isArray(item)
  ? item.flatMap(nodes) : [item, ...nodes(item.props?.children)];
const text = item => typeof item === 'string' ? item : !item ? '' : Array.isArray(item)
  ? item.map(text).join(' ') : text(item.props?.children);
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
function harness({ save = async () => {}, remove = async () => {}, events = [], fetch = async () => events } = {}) {
  const state = [], effects = [], calls = { saves: [], deletes: [] };
  let cursor = 0, firstRender = true, sequence = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (firstRender) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (firstRender) state[index] = { current: initial };
      return state[index];
    },
    useEffect(effect) { if (firstRender) effects.push(effect); },
    useCallback: fn => fn,
  };
  const storage = {
    getAgendaEvents: () => [],
    fetchAgendaEvents: fetch,
    fetchUsersList: async () => [],
    getUsersList: () => [],
    async saveAgendaEvent(event) { calls.saves.push(event); await save(event); },
    async deleteAgendaEvent(id) { calls.deletes.push(id); await remove(id); },
  };
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {}, Error,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '../lib/storage') return { storage };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (name === 'date-fns' || name === 'date-fns/locale') return require(name);
      throw new Error('Unexpected dependency: ' + name);
    },
    crypto: { randomUUID: () => `event-${++sequence}` },
    window: { confirm: () => true, addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {} },
    document: { visibilityState: 'visible' },
  };
  vm.runInNewContext(compiled, context, { filename: 'AdminAgenda.js' });
  const render = () => {
    cursor = 0;
    const tree = context.exports.AdminAgenda({ onBack() {} });
    firstRender = false;
    return tree;
  };
  render();
  effects.forEach(effect => effect());
  const find = predicate => nodes(render()).find(predicate);
  return {
    calls, render, find,
    openNew() { find(node => node.type === 'button' && text(node).includes('Novo Agendamento')).props.onClick(); },
    openEvent(title) { find(node => node.type === 'div' && node.props.onClick && text(node).includes(title)).props.onClick(); },
    change(predicate, value) { find(predicate).props.onChange({ target: { value } }); },
    submit() { return find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); },
    remove() { return find(node => node.props['aria-label'] === 'Excluir agendamento').props.onClick(); },
  };
}

test('agenda waits for saving and prevents duplicate requests while the form is busy', async () => {
  const pending = deferred();
  const app = harness({ save: () => pending.promise });
  await settle();
  app.openNew();
  app.change(node => node.type === 'input' && node.props.placeholder, 'Avaliação');
  const saving = app.submit();
  await app.submit();
  assert.equal(app.calls.saves.length, 1);
  assert.equal(app.find(node => node.type === 'fieldset').props.disabled, true);
  assert.equal(app.find(node => node.props['aria-label'] === 'Fechar agendamento').props.disabled, true);
  assert.ok(app.find(node => node.props.role === 'dialog'));
  pending.resolve();
  await saving;
  assert.equal(app.find(node => node.props.role === 'dialog'), undefined);
  assert.match(text(app.render()), /Avaliação/);
});

test('failed saving retains the draft and reuses the same ID on retry', async () => {
  let attempts = 0;
  const app = harness({ save: async () => { if (++attempts === 1) throw new Error('offline'); } });
  await settle();
  app.openNew();
  app.change(node => node.type === 'input' && node.props.placeholder, 'Treino mantido');
  await app.submit();
  assert.match(text(app.find(node => node.props.role === 'alert')), /Não foi possível salvar/);
  assert.equal(app.find(node => node.type === 'input' && node.props.placeholder).props.value, 'Treino mantido');
  assert.equal(app.find(node => node.type === 'fieldset').props.disabled, false);
  await app.submit();
  assert.equal(app.calls.saves.length, 2);
  assert.equal(app.calls.saves[0].id, app.calls.saves[1].id);
  assert.equal(app.find(node => node.props.role === 'dialog'), undefined);
});

test('failed deletion keeps the event visible and only removes it after confirmation from storage', async () => {
  const event = { id: 'existing', title: 'Consulta', date: require('date-fns').format(new Date(), 'yyyy-MM-dd'),
    startTime: '08:00', endTime: '09:00', type: 'presential', createdAt: new Date().toISOString() };
  const pending = deferred();
  let attempts = 0;
  const app = harness({ events: [event], remove: async () => { if (++attempts === 1) await pending.promise; } });
  await settle();
  app.openEvent('Consulta');
  const deleting = app.remove();
  assert.ok(app.find(node => node.props.role === 'dialog'));
  assert.equal(app.find(node => node.type === 'fieldset').props.disabled, true);
  assert.match(text(app.render()), /Consulta/);
  pending.reject(new Error('offline'));
  await deleting;
  assert.match(text(app.find(node => node.props.role === 'alert')), /Não foi possível excluir/);
  assert.match(text(app.render()), /Consulta/);
  await app.remove();
  assert.deepEqual(app.calls.deletes, ['existing', 'existing']);
  assert.equal(app.find(node => node.props.role === 'dialog'), undefined);
  assert.doesNotMatch(text(app.render()), /Consulta/);
});

test('agenda rejects a reversed time interval before sending data', async () => {
  const app = harness();
  await settle();
  app.openNew();
  app.change(node => node.type === 'input' && node.props.placeholder, 'Horário inválido');
  app.change(node => node.type === 'input' && node.props.type === 'time' && node.props.value === '09:00', '07:00');
  await app.submit();
  assert.equal(app.calls.saves.length, 0);
  assert.match(text(app.find(node => node.props.role === 'alert')), /horário final/);
});

test('shared legacy table records cannot be edited or deleted through the appointment calendar', () => {
  const today = require('date-fns').format(new Date(), 'yyyy-MM-dd');
  const app = harness({ events: ['media_storage', 'trainer_payment_settings', 'assigned_routine', 'deleted_routine'].map(type => ({
    id: type, title: 'Internal record ' + type, type, date: today, startTime: '08:00', endTime: '09:00',
  })) });
  assert.doesNotMatch(text(app.render()), /Internal record/);
  app.find(node => node.type === 'button' && text(node) === 'Mês').props.onClick();
  assert.doesNotMatch(text(app.render()), /Internal record/);
  assert.equal(app.calls.deletes.length, 0);
});

 test('agenda loads remote appointments and exposes refresh failures without erasing the list', async () => {
  let fail = false;
  const event = { id: 'remote', title: 'Agendamento remoto', date: require('date-fns').format(new Date(), 'yyyy-MM-dd'), startTime: '10:00', endTime: '11:00', type: 'online' };
  const app = harness({ fetch: async () => { if (fail) throw new Error('Sem conexão'); return [event, { ...event, id: 'hidden', title: 'Mídia interna', type: 'media_storage' }]; } });
  await settle();
  assert.match(text(app.render()), /Agendamento remoto/);
  assert.doesNotMatch(text(app.render()), /Mídia interna/);
  fail = true;
  await app.find(node => node.type === 'button' && text(node) === 'Atualizar agenda').props.onClick();
  await settle();
  assert.match(text(app.render()), /Sem conexão/);
  assert.match(text(app.render()), /Agendamento remoto/);
});
