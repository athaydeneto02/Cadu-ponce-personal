import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const contact = { exports: {} };
vm.runInNewContext(transpile('../src/lib/studentContact.ts'), { exports: contact.exports, Error });
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const text = node => typeof node === 'string' ? node : typeof node === 'number' ? String(node) : !node ? '' : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const student = { uid: 'student-a', name: 'Aluno A', email: 'a@example.test', role: 'student', status: 'active', createdAt: '2026-11-05' };

function harness(file, props, storage, exportName = 'default') {
  const states = [], effects = [];
  let cursor = 0, first = true;
  const react = {
    useState(initial) { const index = cursor++; if (first) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (first) states[index] = { current: initial }; return states[index]; },
    useEffect(effect) { if (first) effects.push(effect); },
  };
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, Error, Date, structuredClone, crypto: { randomUUID },
    window: { confirm: () => true, addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '../lib/storage') return { storage };
      if (name === '../lib/studentContact') return contact.exports;
      if (name === '../lib/mediaDb') return { resolveMediaUrl: async value => value };
      throw Error('Unknown dependency ' + name);
    },
  };
  vm.runInNewContext(transpile(file), context);
  const render = () => { cursor = 0; const tree = context.exports[exportName](props); first = false; return tree; };
  render(); effects.forEach(effect => effect());
  const find = predicate => all(render()).find(predicate);
  const click = label => { const node = find(item => item.type === 'button' && text(item) === label); assert.ok(node, label); return node.props.onClick(); };
  const change = (label, value) => { const node = find(item => item.type === 'label' && text(item).replace(/\s+/g, ' ').trim().startsWith(label)); assert.ok(node, label); const input = all(node).find(item => ['input', 'textarea', 'select'].includes(item.type)); input.props.onChange({ target: { value, checked: value, files: value } }); };
  return { render, find, click, change, submit: () => find(item => item.type === 'form').props.onSubmit({ preventDefault() {} }) };
}

test('student phone is normalized once and never uses the trainer number as a fallback', () => {
  assert.equal(contact.exports.normalizeStudentPhone('(43) 99999-1234'), '5543999991234');
  assert.equal(contact.exports.normalizeStudentPhone('+55 43 99999-1234'), '5543999991234');
  assert.equal(contact.exports.studentWhatsAppUrl({ trainerPhone: '5543999990000' }), undefined);
  assert.throws(() => contact.exports.normalizeStudentPhone('123'));
});

test('student editing waits for remote confirmation and retains the draft after failure', async () => {
  const pending = deferred(), saved = [], completed = [];
  const app = harness('../src/components/StudentProfileEditor.tsx', { student, onSaved: value => completed.push(value), onCancel() {} }, { updateProfile: value => { saved.push(value); return pending.promise; } });
  app.change('Nome', 'Novo nome'); app.change('WhatsApp', '(43) 99999-1234');
  const operation = app.submit(); await app.submit();
  assert.equal(saved.length, 1); assert.equal(saved[0].metadata.phone, '5543999991234');
  assert.equal(completed.length, 0); assert.equal(app.find(item => item.type === 'fieldset').props.disabled, true);
  pending.reject(new Error('Falha no servidor')); await operation;
  assert.match(text(app.render()), /Falha no servidor/);
  assert.equal(app.find(item => item.type === 'input' && item.props.value === 'Novo nome').props.value, 'Novo nome');
});

test('extra workout retries use the same ID, persist flags, and wait before completing', async () => {
  const saved = [], changed = [];
  let attempt = 0;
  const app = harness('../src/components/AdminRoutineModule.tsx', { student, routines: [], kind: 'extra', createInitially: true, onChanged: value => changed.push(value) }, { saveAdminRoutine: async value => { saved.push(structuredClone(value)); if (++attempt === 1) throw Error('Sem conexão'); value.version = attempt; } });
  app.change('Nome', 'Caminhada'); app.click('Adicionar atividade');
  app.change('Atividade', 'Caminhada leve'); app.change('Duração', '20 minutos');
  app.change('Exibir somente', true); app.change('Começa em', '2026-11-10');
  await app.submit(); assert.equal(changed.length, 0); assert.match(text(app.render()), /Sem conexão/);
  await app.submit(); assert.equal(saved.length, 2); assert.equal(saved[0].id, saved[1].id);
  assert.equal(saved[1].kind, 'extra'); assert.equal(saved[1].hideBeforeStart, true); assert.equal(saved[1].exercises[0].reps, '20 minutos');
  assert.equal(changed.length, 1); assert.equal(app.find(item => item.type === 'form'), undefined);
});

test('removing a routine from a student calls only the targeted unassignment', async () => {
  const routine = { id: 'shared', name: 'Compartilhada', studentIds: [student.uid, 'student-b'], studentNames: ['A', 'B'], exercises: [], kind: 'strength' };
  const removed = [], changes = [];
  const app = harness('../src/components/AdminRoutineModule.tsx', { student, routines: [routine], kind: 'strength', onChanged: value => changes.push(value) }, {
    unassignRoutineFromStudent: async (...args) => removed.push(args), fetchAdminRoutines: async () => [{ ...routine, studentIds: ['student-b'] }],
    deleteAdminRoutine: () => { throw Error('Global delete must not be called'); },
  });
  await app.click('Retirar deste aluno'); await settle();
  assert.deepEqual(removed, [['shared', student.uid]]); assert.deepEqual([...changes.at(-1)[0].studentIds], ['student-b']);
});

test('assessment saving confirms persistence and failures preserve measurements', async () => {
  const saved = [];
  let fail = true;
  const app = harness('../src/components/AdminStudentModules.tsx', { student, module: 'assessments' }, {
    fetchAssessments: async () => [], saveAssessment: async value => { saved.push(structuredClone(value)); if (fail) throw Error('Falha de gravação'); },
  }, 'StudentRecords');
  await settle(); app.click('Nova avaliação'); app.change('Peso', '82.5'); app.change('Cintura', '89');
  await app.submit(); assert.match(text(app.render()), /Falha de gravação/);
  assert.ok(app.find(item => item.type === 'input' && item.props.value === 82.5));
  fail = false; await app.submit(); assert.equal(saved[0].id, saved[1].id); assert.equal(saved[1].measurements.Cintura, 89);
  assert.equal(app.find(item => item.type === 'form'), undefined); assert.match(text(app.render()), /82.5 kg/);
});

test('anamnesis editing retains answers and version while persisting new questions as pending', async () => {
  const record = { id: 'form', studentId: student.uid, title: 'Inicial', status: 'answered', version: 4, questions: [{ id: 'q1', label: 'Objetivo?', answer: 'Correr' }] };
  let saved;
  const app = harness('../src/components/AdminStudentModules.tsx', { student, module: 'anamneses' }, {
    fetchAnamneses: async () => [record], saveAnamnesis: async value => { saved = value; return { ...value, version: 5 }; },
  }, 'StudentRecords');
  await settle(); app.click('Editar'); app.click('Adicionar pergunta'); app.change('Pergunta 2', 'Disponibilidade?');
  await app.submit(); assert.equal(saved.questions[0].answer, 'Correr'); assert.equal(saved.version, 4); assert.equal(saved.status, 'pending');
});

test('file upload and deletion show success only after the server confirms it', async () => {
  const pending = deferred(); let failDelete = true;
  const record = { id: 'file', studentId: student.uid, name: 'Exame.pdf', storagePath: 'storage://student-files/exam.pdf', mimeType: 'application/pdf', size: 1024, createdAt: '2026-11-05' };
  const app = harness('../src/components/AdminStudentModules.tsx', { student, module: 'files' }, {
    fetchStudentFiles: async () => [], uploadStudentFile: () => pending.promise,
    deleteStudentFile: async () => { if (failDelete) throw Error('Não excluído'); },
  }, 'StudentRecords');
  await settle(); app.change('Arquivo', [{ name: 'Exame.pdf' }]); const operation = app.submit();
  assert.doesNotMatch(text(app.render()), /Exame.pdf/); pending.resolve(record); await operation;
  assert.match(text(app.render()), /Exame.pdf/); app.click('Excluir'); await settle();
  assert.match(text(app.render()), /Não excluído/); assert.match(text(app.render()), /Exame.pdf/);
  failDelete = false; app.click('Excluir'); await settle(); assert.doesNotMatch(text(app.render()), /Exame.pdf/);
});

test('student groups merge fresh remote profiles and preserve confirmed results when a later student fails', async () => {
  const first = { ...student, metadata: { group: 'Antigo', phone: '5543999991234' } };
  const second = { ...student, uid: 'student-b', name: 'Aluno B' };
  const saved = [], updated = [];
  const app = harness('../src/components/AdminStudentGroups.tsx', { users: [first, second], onSaved: value => updated.push(value), onOpen() {} }, {
    fetchUsersList: async () => [{ ...first, name: 'Nome remoto atualizado' }, second],
    updateProfile: async value => { saved.push(value); if (value.uid === second.uid) throw Error('Falha no segundo aluno'); },
  });
  app.change('Nome do grupo', 'Turma A'); app.change('Aluno A', true); app.change('Aluno B', true);
  await app.submit(); assert.equal(updated.length, 1); assert.equal(saved[0].name, 'Nome remoto atualizado');
  assert.equal(saved[0].metadata.phone, first.metadata.phone); assert.equal(saved[0].metadata.group, 'Turma A');
  assert.match(text(app.render()), /1 aluno.*atualizado/); assert.match(text(app.render()), /Falha no segundo aluno/);
});
