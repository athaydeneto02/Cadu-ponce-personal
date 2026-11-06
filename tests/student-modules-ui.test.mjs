import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8').replace(/import\.meta\.env\.VITE_VAPID_PUBLIC_KEY/g, 'undefined'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const label = node => !node ? '' : ['string', 'number'].includes(typeof node) ? String(node) : Array.isArray(node) ? node.map(label).join('') : label(node.props?.children);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const formEvent = { preventDefault() {} };

function harness(file, props, methods, exportName = 'default') {
  const slots = [], effects = [], modules = new Map(), listeners = new Map(); let cursor = 0, dirty = false, opens = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  react.default = react;
  const storage = { getUser: () => ({ uid: 'student', role: 'student' }), ...methods };
  const jsx = (type, props) => typeof type === 'function' && ['StudentResourcePage', 'StudentHome'].includes(type.name) ? type(props) : ({ type, props });
  const contextFor = () => ({ exports: {}, Date, Error, console, crypto: { randomUUID },
    window: { addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, removeEventListener(name, fn) { listeners.get(name)?.delete(fn); }, open() { opens++; return null; }, confirm: () => true },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === '../lib/storage') return { storage };
      if (name === '../lib/mediaDb') return { resolveMediaUrl: async () => 'https://example.test/private-signed-file' };
      if (name === '../lib/useWorkoutFrequency') return { useWorkoutFrequency: () => ({ dates: new Set(), weekDates: [], monthCompletedDays: new Set(), loading: false, error: '' }) };
      if (name === '../lib/trainerConfig') return { getTrainerWhatsAppUrl: () => 'https://wa.me/5500000000000', TRAINER_CONFIG: { name: 'Cadu Ponce' } };
      if (name === '../lib/workoutFrequency') return { localWorkoutDateKey: value => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; } };
      if (name === './StudentResourcePage') return load('StudentResourcePage');
      if (name === './StudentHome') return load('StudentHome');
      return new Proxy({}, { get: (_, key) => String(key) });
    },
  });
  function load(name) { if (modules.has(name)) return modules.get(name); const context = contextFor(); vm.runInNewContext(transpile(`../src/components/${name}.tsx`), context); modules.set(name, context.exports); return context.exports; }
  const component = load(file)[exportName];
  const render = () => { let tree, attempts = 0; do { assert.ok(attempts++ < 20); dirty = false; cursor = 0; tree = component(props); effects.splice(0).forEach(fn => fn()); } while (dirty); return tree; };
  const find = predicate => { const node = all(render()).find(predicate); assert.ok(node, 'element exists'); return node; };
  return { render, find, opens: () => opens, dispatch: name => listeners.get(name)?.forEach(fn => fn()) };
}

test('feedback only confirms after persistence; double-submit and failed retry preserve the same record without opening WhatsApp', async () => {
  const saved = [], requests = [], successes = [];
  const app = harness('WorkoutList', { routine: { id: 'routine', name: 'Treino A' }, studentId: 'student', feedbacks: [], onSaved: value => successes.push(value), onClose() {} }, {
    saveWorkoutFeedback(value) { saved.push(value); return new Promise((resolve, reject) => requests.push({ resolve, reject })); },
  }, 'FeedbackModal');
  app.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Carga ajustada' } });
  const form = app.find(n => n.type === 'form'); const first = form.props.onSubmit(formEvent); await form.props.onSubmit(formEvent);
  assert.equal(saved.length, 1); assert.equal(successes.length, 0);
  assert.equal(app.find(n => n.type === 'button' && label(n) === 'Salvando...').props.disabled, true);
  requests[0].reject(new Error('Conexão indisponível')); await first;
  assert.match(label(app.render()), /Conexão indisponível/);
  assert.equal(app.find(n => n.type === 'textarea').props.value, 'Carga ajustada');
  const second = app.find(n => n.type === 'form').props.onSubmit(formEvent);
  assert.equal(saved[1].id, saved[0].id); assert.equal(saved[1].createdAt, saved[0].createdAt);
  requests[1].resolve(saved[1]); await second;
  assert.match(label(app.render()), /Feedback salvo e disponível/); assert.equal(successes.length, 1); assert.equal(app.opens(), 0);
});

test('anamnesis preserves answers and version on failure and confirms only a saved response', async () => {
  const record = { id: 'form', studentId: 'student', title: 'Saúde', status: 'pending', version: 3, questions: [{ id: 'q', label: 'Restrições?' }] };
  const submissions = [], pending = [];
  const app = harness('StudentAnamneses', { studentId: 'student', onBack() {} }, {
    fetchAnamneses: async () => [record], saveAnamnesis(value) { submissions.push(value); return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
  });
  app.render(); await settle();
  app.find(n => n.type === 'button' && label(n) === 'Responder questionário').props.onClick();
  app.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Sem restrições' } });
  const form = app.find(n => n.type === 'form'); const first = form.props.onSubmit(formEvent); await form.props.onSubmit(formEvent);
  assert.equal(submissions.length, 1); assert.equal(submissions[0].version, 3); assert.equal(submissions[0].status, 'answered');
  pending[0].reject(new Error('Não foi salvo')); await first;
  assert.match(label(app.render()), /Não foi salvo/); assert.equal(app.find(n => n.type === 'textarea').props.value, 'Sem restrições');
  const retry = app.find(n => n.type === 'form').props.onSubmit(formEvent);
  pending[1].resolve({ ...submissions[1], version: 4 }); await retry;
  assert.match(label(app.render()), /Respostas salvas e disponíveis/); assert.equal(all(app.render()).some(n => n.type === 'form'), false);
});

test('student file list exposes confirmed uploads, opening handles popup blocking, and failed deletion retains the file', async () => {
  const record = { id: 'file', studentId: 'student', name: 'exame.pdf', storagePath: 'student/file.pdf', mimeType: 'application/pdf', size: 1000, createdAt: '2026-11-05T12:00:00Z' };
  const calls = []; let fail = true;
  const app = harness('StudentFiles', { studentId: 'student', onBack() {} }, {
    fetchStudentFiles: async () => [],
    uploadStudentFile: async (uid, file, category) => { calls.push({ uid, file, category }); if (fail) throw new Error('Envio recusado'); return record; },
    deleteStudentFile: async () => { throw new Error('Exclusão indisponível'); },
  });
  app.render(); await settle();
  const inputEvent = () => ({ currentTarget: { files: [{ name: 'exame.pdf', size: 1000, type: 'application/pdf' }], value: 'selected' } });
  await app.find(n => n.type === 'input').props.onChange(inputEvent());
  assert.match(label(app.render()), /Envio recusado/); assert.doesNotMatch(label(app.render()), /salvo\(s\)/);
  fail = false; await app.find(n => n.type === 'input').props.onChange(inputEvent());
  assert.equal(calls[1].uid, 'student'); assert.match(label(app.render()), /exame.pdf/);
  app.find(n => n.type === 'button' && label(n) === 'Abrir arquivo').props.onClick(); await settle();
  assert.equal(app.find(n => n.type === 'a').props.href, 'https://example.test/private-signed-file');
  app.find(n => n.type === 'button' && n.props['aria-label'] === 'Excluir exame.pdf').props.onClick(); await settle();
  assert.match(label(app.render()), /Exclusão indisponível/); assert.ok(app.find(n => n.type === 'button' && label(n) === 'Abrir arquivo'));
});

test('an initial file read cannot erase an upload confirmed while that read was in flight', async () => {
  let resolveRead;
  const record = { id: 'new', studentId: 'student', name: 'novo.pdf', storagePath: 'student/new.pdf', mimeType: 'application/pdf', size: 1, createdAt: '2026-11-05T12:00:00Z' };
  const app = harness('StudentFiles', { studentId: 'student', onBack() {} }, {
    fetchStudentFiles: () => new Promise(resolve => { resolveRead = resolve; }), uploadStudentFile: async () => record,
  });
  app.render();
  await app.find(n => n.type === 'input').props.onChange({ currentTarget: { files: [{ name: 'novo.pdf', size: 1 }], value: '' } });
  resolveRead([]); await settle(); assert.match(label(app.render()), /novo.pdf/);
});

test('an unrelated outbox synchronization cannot discard the gallery read still in flight', async () => {
  let resolveRead;
  const photo = { id: 'cloud-photo', studentId: 'student', photoURL: 'storage://evolution-photos/student/photo.jpg', notes: 'Foto salva em outro dispositivo', date: '2026-11-05T12:00:00Z', syncStatus: 'synced' };
  const app = harness('Dashboard', { user: { uid: 'student', name: 'Aluno', role: 'student' }, workouts: [], onStartWorkout() {} }, {
    getPhotos: () => [], fetchPhotos: () => new Promise(resolve => { resolveRead = resolve; }),
  });
  app.find(n => n.type === 'button' && /Meu\s*progresso/i.test(label(n))).props.onClick();
  assert.match(label(app.render()), /Carregando fotos/);
  app.dispatch('cadu_data_synced');
  assert.match(label(app.render()), /Carregando fotos/);
  resolveRead([photo]); await settle();
  assert.match(label(app.render()), /Foto salva em outro dispositivo/);
  assert.doesNotMatch(label(app.render()), /Carregando fotos|Nenhuma foto enviada/);
});

test('a private file resolved after an account change is never exposed as a download link', async () => {
  let actor = 'student';
  const record = { id: 'file', studentId: 'student', name: 'private-exam.pdf', storagePath: 'storage://arquivos-alunos/student/file.pdf', size: 20, createdAt: '2026-11-05' };
  const app = harness('StudentFiles', { studentId: 'student', onBack() {} }, {
    getUser: () => ({ uid: actor }), fetchStudentFiles: async () => [record],
  });
  app.render(); await settle();
  app.find(n => n.type === 'button' && label(n) === 'Abrir arquivo').props.onClick();
  actor = 'another-student'; await settle();
  assert.equal(all(app.render()).some(node => node.type === 'a'), false);
  assert.match(label(app.render()), /A sessão mudou/);
});
