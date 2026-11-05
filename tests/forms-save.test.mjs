import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const text = node => typeof node === 'string' ? node : !node ? '' : Array.isArray(node)
  ? node.map(text).join(' ') : text(node.props?.children);
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(component, props, storage = {}) {
  storage = { getUser: () => ({ uid: 'student', name: 'Aluno' }), ...storage };
  const source = readFileSync(new URL(`../src/components/${component}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const state = [];
  let cursor = 0, first = true, sequence = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (first) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; if (first) state[index] = { current: initial }; return state[index]; },
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, crypto: { randomUUID: () => `id-${++sequence}` }, console,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '../lib/storage') return { storage };
      if (name === '../lib/workoutSession') return require('../src/lib/workoutSession.ts');
      if (name === '../lib/trainerConfig') return { TRAINER_CONFIG: { phone: '1234' } };
      if (name === 'motion/react') return { motion: new Proxy({}, { get: (_, key) => `motion.${String(key)}` }), AnimatePresence: 'AnimatePresence' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      return { default() {} };
    },
  };
  vm.runInNewContext(compiled, context);
  const render = () => { cursor = 0; const tree = context.exports.default(props); first = false; return tree; };
  render();
  return { render, find: predicate => nodes(render()).find(predicate) };
}

test('exercise completion waits for persistence, reports a failure, and retries with the same ID', async () => {
  const calls = [];
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const app = harness('WorkoutSession', { workout: { id: 'workout', studentId: 'student', name: 'Treino',
    exercises: [{ id: 'exercise', name: 'Agachamento', sets: 1, reps: '10', rest: '30s' }] }, onClose() {} },
    { async saveProgress(entry) { calls.push(entry); if (calls.length === 1) await pending; } });
  const complete = () => app.find(node => node.type === 'button' && /CONCLUIR EXERCÍCIO|SALVANDO|CONCLUÍDO/.test(text(node)));
  complete().props.onClick();
  complete().props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(complete().props.disabled, true);
  assert.doesNotMatch(text(complete()), /CONCLUÍDO/);
  reject(new Error('offline'));
  await settle();
  assert.match(text(app.find(node => node.props.role === 'alert')), /Não foi possível salvar/);
  complete().props.onClick();
  await settle();
  assert.equal(calls[0].id, calls[1].id);
  assert.match(text(complete()), /CONCLUÍDO/);
});

test('empty legacy workout has a readable return screen instead of dereferencing an exercise', () => {
  const app = harness('WorkoutSession', { workout: { id: 'empty', name: 'Vazio', exercises: [] }, onClose() {} });
  assert.match(text(app.render()), /ainda não tem exercícios/);
});

test('personal data form retains entered values and displays rejected saves', async () => {
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const app = harness('PersonalDataForm', { user: { uid: 'user', name: 'Nome Original', email: 'user@example.invalid' },
    onSave: () => pending, onClose() {} });
  app.find(node => node.props.id === 'profile-first-name').props.onChange({ target: { value: 'Alterado' } });
  const saving = app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(app.find(node => node.props.type === 'submit').props.disabled, true);
  reject(new Error('offline'));
  await saving;
  assert.equal(app.find(node => node.props.id === 'profile-first-name').props.value, 'Alterado');
  assert.match(text(app.find(node => node.props.role === 'alert')), /Não foi possível salvar/);
  assert.equal(app.find(node => node.props.type === 'submit').props.disabled, false);
});
