import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const component = transpile('../src/components/AccountManagement.tsx');
const library = { exports: {} };
vm.runInNewContext(transpile('../src/lib/exerciseLibrary.ts'), { exports: library.exports });
const attendance = { exports: {} };
vm.runInNewContext(transpile('../src/lib/workoutAttendance.ts'), { exports: attendance.exports });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const label = node => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(label).join('') : label(node.props?.children);
const hasLabel = (node, text) => node.props?.['aria-label'] === text || all(node).some(child => ['span', 'h2', 'h3'].includes(child.type) && label(child) === text);

function harness(overrides = {}) {
  const item = { id: 'original-id', title: 'Agachamento', group: 'Pernas', category: 'Livre', image: '', isCustom: true,
    videoUrl: '', videoFileUrl: 'storage://exercise-videos/exercises/original.mp4', description: 'Nota original', syncStatus: 'synced' };
  const calls = { saved: [], routines: [], groups: [] };
  let saveResolve, saveReject;
  const storage = {
    getUser: () => ({ uid: 'admin' }),
    getCacheItem: key => key === 'cadu_ponce_exercises_v3' ? JSON.stringify([item]) : null,
    getMuscleGroups: () => ['Pernas'], getCategories: () => ['Livre'], getWorkouts: () => [],
    getAdminRoutines: () => [{ id: 'routine', name: 'Rotina', version: 3, studentIds: ['student'], studentNames: ['Aluno'], exercises: [{ id: 'prescribed-id', name: item.title, reps: '12' }] }],
    fetchUsersList: async () => [{ uid: 'student', name: 'Aluno', email: 'student@example.test', role: 'student', status: 'active' }],
    fetchAdminRoutines: async () => storage.getAdminRoutines(), fetchCustomExercises: async () => [item],
    fetchMuscleGroups: async () => ['Pernas'], fetchCategories: async () => ['Livre'],
    fetchAgendaEvents: async () => [], fetchTrainerNotifications: async () => [], fetchPaymentSettings: async () => ({}),
    saveCustomExercise: value => { calls.saved.push(value); return new Promise((resolve, reject) => { saveResolve = resolve; saveReject = reject; }); },
    saveAdminRoutine: value => { calls.routines.push(value); return Promise.resolve(); },
    addMuscleGroup: value => { calls.groups.push(value); return Promise.resolve([value]); },
    ...overrides,
  };
  const state = [], effects = [];
  let cursor = 0, first = true;
  const react = {
    useState(initial) { const i = cursor++; if (first) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (first) state[i] = { current: initial }; return state[i]; },
    useEffect(effect) { if (first) effects.push(effect); }, useCallback: fn => fn,
  };
  const presentationModules = new Map([
    ['./AdminChrome', '../src/components/AdminChrome.tsx'],
    ['./AdminDashboardHome', '../src/components/AdminDashboardHome.tsx'],
  ]);
  const presentationExports = new Map();
  const presentationTypes = new Set();
  let presentationDepth = 0;
  const jsx = (type, props) => {
    // Expand the real presentation tree, including its local card components,
    // while keeping unrelated stateful children outside this focused harness.
    if (typeof type === 'function' && (presentationTypes.has(type) || presentationDepth > 0)) {
      presentationDepth++;
      try { return type(props); }
      finally { presentationDepth--; }
    }
    return { type, props };
  };
  const channel = { on() { return this; }, subscribe() { return this; } };
  const context = { exports: {}, crypto: { randomUUID }, URL, URLSearchParams, Error, console,
    require(name) {
      if (presentationModules.has(name)) {
        if (!presentationExports.has(name)) {
          const module = { exports: {} };
          vm.runInNewContext(transpile(presentationModules.get(name)), { ...context, exports: module.exports });
          presentationExports.set(name, module.exports);
          for (const value of Object.values(module.exports)) if (typeof value === 'function') presentationTypes.add(value);
        }
        return presentationExports.get(name);
      }
      if (name === './BrandLogo') return { default: 'BrandLogo' };
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '../lib/storage') return { storage, safeSetItem() {} };
      if (name === '../lib/studentContact') return { normalizeStudentPhone: phone => '55' + phone.replace(/\D/g, ''), studentWhatsAppUrl: () => undefined };
      if (name === './AdminStudentModules') return { default: 'StudentModules', newAnamnesis: uid => ({ id: 'form', studentId: uid }) };
      if (name === '../lib/exerciseLibrary') return library.exports;
      if (name === '../lib/workoutAttendance') return attendance.exports;
      if (name === '../lib/useTrainerNotifications') return { useTrainerNotifications: () => ({ items: [], loading: false, error: '', busy: false, refresh: async () => {}, markRead: async () => {} }) };
      if (name === '../lib/useWorkoutAttendance') return { useWorkoutAttendance: () => ({ logs: [], loading: false, error: '', refresh() {} }) };
      if (name === '../lib/usePushNotifications') return { usePushNotifications: () => ({ status: 'unsupported', error: '', enable: async () => {} }) };
      if (name === '../lib/mediaDb') return { useMediaUrl: value => value || '', normalizeStoredMediaReference: value => value || null };
      if (name === '../lib/supabase') return { supabase: { channel: () => channel } };
      if (name === '../lib/trainerConfig') return { TRAINER_CONFIG: { phone: '5500000000000' }, getTrainerWhatsAppUrl: () => 'https://wa.me/5500000000000' };
      if (name === 'motion/react') return { motion: new Proxy({}, { get: (_, key) => String(key) }), AnimatePresence: 'AnimatePresence' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (name === 'date-fns') return { format: () => 'novembro' };
      return {};
    },
    window: { addEventListener() {}, removeEventListener() {}, confirm: () => true, location: { origin: 'https://example.test' } },
    navigator: {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, alert() {},
  };
  vm.runInNewContext(component, context);
  const render = () => { cursor = 0; const result = context.exports.default({ onClose() {} }); first = false; return result; };
  render(); effects.forEach(effect => effect());
  const click = (tree, predicate) => { const button = all(tree).find(node => node.type === 'button' && predicate(node)); assert.ok(button, 'button exists'); button.props.onClick({ stopPropagation() {} }); };
  return { calls, render, click, find: predicate => all(render()).find(predicate), resolve: () => saveResolve(), reject: error => saveReject(error) };
}


test('inactivation and soft exclusion persist remotely before changing the selected student', async () => {
  let resolve, reject;
  const updates = [];
  const app = harness({ updateProfile: value => { updates.push(value); return new Promise((yes, no) => { resolve = yes; reject = no; }); } });
  await settle();
  app.click(app.render(), node => hasLabel(node, 'Alunos ativos'));
  app.click(app.render(), node => label(node).includes('Aluno') && !label(node).includes('Alunos'));
  app.click(app.render(), node => label(node) === 'Opções');
  app.click(app.render(), node => label(node).trim() === 'Inativar aluno');
  assert.equal(updates.length, 1); assert.equal(updates[0].status, 'inactive');
  assert.ok(app.find(node => node.type === 'button' && label(node).trim() === 'Inativar aluno'));
  reject(new Error('Falha de servidor')); await settle();
  assert.ok(app.find(node => node.type === 'button' && label(node).trim() === 'Inativar aluno'));
  app.click(app.render(), node => label(node).trim() === 'Inativar aluno'); resolve(); await settle();
  assert.ok(app.find(node => node.type === 'button' && label(node).trim() === 'Reativar aluno'));
  app.click(app.render(), node => label(node).trim() === 'Excluir aluno');
  assert.equal(updates.at(-1).status, 'excluded'); resolve(); await settle();
  assert.equal(app.find(node => node.type === 'button' && label(node).trim() === 'Excluir aluno').props.disabled, true);
});

test('routine assignment sends one versioned atomic save and never creates cached workout copies', async () => {
  const saved = []; let resolve;
  const app = harness({ saveAdminRoutine: value => { saved.push(value); return new Promise(yes => { resolve = yes; }); }, saveWorkout() { throw Error('Must not create copies client-side'); } });
  await settle();
  app.click(app.render(), node => hasLabel(node, 'Treinos'));
  app.click(app.render(), node => node.props.title === 'Atribuir a Alunos');
  app.click(app.render(), node => label(node).includes('Salvar Atribuição'));
  app.click(app.render(), node => label(node).includes('Salvar Atribuição'));
  assert.equal(saved.length, 1); assert.equal(saved[0].version, 3); assert.deepEqual([...saved[0].studentIds], ['student']);
  resolve(); await settle();
  assert.equal(app.find(node => node.type === 'button' && label(node).includes('Salvar Atribuição')), undefined);
});

test('creating a student normalizes their own phone and discloses manual delivery only after success', async () => {
  let resolve; const calls = [];
  const app = harness({ adminCreateUser: (...args) => { calls.push(args); return new Promise(yes => { resolve = yes; }); } });
  await settle(); app.click(app.render(), node => hasLabel(node, 'Adicionar aluno'));
  const change = (labelText, value) => { const field = app.find(node => node.type === 'div' && all(node).some(child => child.type === 'label' && label(child).includes(labelText)) && all(node).filter(child => child.type === 'input').length === 1); assert.ok(field, labelText); all(field).find(child => child.type === 'input').props.onChange({ target: { value } }); };
  change('Nome completo', 'Novo aluno'); change('E-mail', 'new@example.test'); change('Senha', 'senha-inicial-segura'); change('WhatsApp do aluno', '(43) 99999-1234');
  const operation = app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1); assert.equal(calls[0][2].metadata.phone, '5543999991234'); assert.equal(calls[0][2].trainerPhone, '5500000000000');
  assert.equal(calls[0][2].metadata.sendAccessInfo, undefined); assert.equal(app.find(node => node.props['aria-label'] === 'Acesso criado'), undefined);
  resolve({ uid: 'new', name: 'Novo aluno', email: 'new@example.test' }); await operation;
  assert.ok(app.find(node => node.props['aria-label'] === 'Acesso criado'));
  assert.match(label(app.render()), /Nenhum e-mail ou WhatsApp foi enviado/);
});
