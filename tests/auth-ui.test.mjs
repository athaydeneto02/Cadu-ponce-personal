import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual App auth lifecycle with controlled auth/storage services.
// This harness does not connect to Supabase or render into a real browser.
const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function harness({ profileRole = 'student', status = 'active', pathname = '/', profileFailure = false, verified = true, storageBlocked = false, preferences = new Map() } = {}) {
  const state = [];
  const effects = [];
  const calls = { profileReads: 0, signIns: 0, scopes: [], preferenceWrites: [] };
  let cursor = 0;
  let firstRender = true;
  let dirty = false;
  let authCallback;
  let resolveProfile;
  let delayedProfile = false;
  let cachedUid = 'student-a';
  let finishUpdate;
  let user = { id: 'student-a', email: 'cadu-client@example.invalid', user_metadata: { role: 'admin' } };
  let profile = { uid: user.id, name: 'Aluno', email: user.email, role: profileRole, status, createdAt: '2026-01-01' };
  const react = {
    lazy(loader) { return loader.toString().match(/components\/([^'"\)]+)/)?.[1]; },
    useState(initial) {
      const index = cursor++;
      if (firstRender) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => {
        const next = typeof value === 'function' ? value(state[index]) : value;
        if (!Object.is(next, state[index])) { state[index] = next; dirty = true; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = state[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
        const current = { deps, cleanup: previous?.cleanup };
        state[index] = current;
        effects.push(() => { previous?.cleanup?.(); current.cleanup = effect(); });
      }
    },
  };
  const storage = {
    getUser: () => cachedUid ? ({ ...profile, uid: cachedUid, role: 'admin' }) : null,
    setSessionUser: id => { cachedUid = id; calls.scopes.push(id); },
    updateProfile: () => new Promise(resolve => { finishUpdate = resolve; }),
    saveUser() {},
    fetchProfile: async () => {
      calls.profileReads++;
      if (profileFailure) throw new Error('Profile unavailable');
      if (delayedProfile) return new Promise(resolve => { resolveProfile = resolve; });
      return profile;
    },
    fetchWorkouts: async () => [],
    syncPendingData: async () => {},
  };
  const supabase = { auth: {
    onAuthStateChange(callback) { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    getUser: async () => ({ data: { user: verified ? user : null }, error: verified ? null : new Error('Invalid session') }),
    signInWithPassword: async () => { calls.signIns++; return { error: new Error('Invalid login credentials') }; },
    signOut: async () => { authCallback('SIGNED_OUT', null); return { error: null }; },
  } };
  const presentationModules = new Map([
    ['./components/StudentChrome', '../src/components/StudentChrome.tsx'],
    ['./components/StudentProfile', '../src/components/StudentProfile.tsx'],
  ]);
  const presentationExports = new Map();
  const presentationTypes = new Set();
  let presentationDepth = 0;
  const jsx = (type, props) => {
    if (typeof type === 'function' && (presentationTypes.has(type) || presentationDepth > 0)) {
      presentationDepth++;
      try { return type(props); }
      finally { presentationDepth--; }
    }
    return { type, props };
  };
  const location = { pathname };
  const context = {
    exports: {},
    require(name) {
      if (presentationModules.has(name)) {
        if (!presentationExports.has(name)) {
          const module = { exports: {} };
          const code = ts.transpileModule(readFileSync(new URL(presentationModules.get(name), import.meta.url), 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
          }).outputText;
          vm.runInNewContext(code, { ...context, exports: module.exports });
          presentationExports.set(name, module.exports);
          for (const value of Object.values(module.exports)) if (typeof value === 'function') presentationTypes.add(value);
        }
        return presentationExports.get(name);
      }
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === './lib/supabase') return { supabase };
      if (name === './lib/storage') return { storage };
      if (name.endsWith('/lib/trainerConfig')) return {
        TRAINER_CONFIG: { name: 'Cadu Ponce', instagramUrl: 'https://instagram.com/caduponce.personal', instagramHandle: 'caduponce.personal' },
        getTrainerWhatsAppUrl: () => 'https://wa.me/5500000000000',
      };
      if (name === 'motion/react') return { motion: new Proxy({}, { get: (_, key) => 'motion.' + String(key) }), AnimatePresence: 'AnimatePresence' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      return { default: name.split('/').pop() };
    },
    window: { location, history: { replaceState(_state, _unused, path) { location.pathname = path; } }, addEventListener() {}, removeEventListener() {} },
    navigator: { onLine: true },
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('Storage unavailable'); return preferences.get(key) ?? null; },
      setItem(key, value) {
        calls.preferenceWrites.push({ key, value });
        if (storageBlocked) throw new Error('QuotaExceededError');
        preferences.set(key, value);
      }, removeItem(key) { preferences.delete(key); },
    },
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
    console,
  };
  vm.runInNewContext(compiled, context, { filename: 'App.js' });
  const render = () => {
    let result, count = 0;
    do {
      assert.ok(count++ < 20, 'App stabilizes after effects');
      cursor = 0; dirty = false;
      result = context.exports.default(); firstRender = false;
      effects.splice(0).forEach(effect => effect());
    } while (dirty);
    return result;
  };
  render();
  return {
    render, calls, preferences,
    emit: event => authCallback(event, { user, access_token: 'test-only-token' }),
    switchUser: uid => { user = { ...user, id: uid }; profile = { ...profile, uid }; authCallback('SIGNED_IN', { user, access_token: 'other-test-token' }); },
    signOut: () => authCallback('SIGNED_OUT', null),
    noSession: () => authCallback('INITIAL_SESSION', null),
    delayProfile: () => { delayedProfile = true; },
    finishProfile: () => resolveProfile(profile),
    switchCachedActor: uid => { cachedUid = uid; },
    finishUpdate: () => finishUpdate(),
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 15));

test('forged cached administrator cannot enter without a session', () => {
  const app = harness();
  app.noSession();
  assert.equal(app.render().type, 'Login');
  assert.equal(app.calls.profileReads, 0);
});

test('email and user metadata cannot override a student database role', async () => {
  const app = harness();
  app.emit('SIGNED_IN');
  await settle();
  assert.equal(app.render().type, 'div');
  assert.equal(app.calls.profileReads, 1);
  assert.equal(app.calls.scopes.at(-1), 'student-a');
});

test('verified administrator gets the admin screen', async () => {
  const app = harness({ profileRole: 'admin' });
  app.emit('SIGNED_IN');
  await settle();
  assert.equal(app.render().type, 'AccountManagement');
});

test('unavailable browser storage cannot crash initial render or a verified session', async () => {
  const app = harness({ profileRole: 'admin', storageBlocked: true });
  app.emit('SIGNED_IN');
  await settle();
  assert.equal(app.render().type, 'AccountManagement');
});

test('unverifiable session and inactive account fail closed', async () => {
  for (const options of [{ verified: false }, { status: 'inactive' }, { profileFailure: true }]) {
    const app = harness(options);
    app.emit('SIGNED_IN');
    await settle();
    assert.equal(app.render().type, 'Login');
    assert.ok(app.render().props.errorMessage);
  }
});

test('profile completing after sign-out cannot restore the session', async () => {
  const app = harness({ profileRole: 'admin' });
  app.delayProfile();
  app.emit('SIGNED_IN');
  await settle();
  app.signOut();
  app.finishProfile();
  await settle();
  assert.equal(app.render().type, 'Login');
});

test('password recovery opens reset form before profile access', async () => {
  const app = harness({ pathname: '/reset-password', profileFailure: true });
  app.emit('PASSWORD_RECOVERY');
  await settle();
  const view = app.render();
  assert.equal(view.type, 'UpdatePasswordForm');
  assert.equal(view.props.recovery, true);
  assert.equal(app.calls.profileReads, 0);
  await view.props.onSuccess();
  assert.equal(app.render().type, 'Login');
  assert.match(app.render().props.notice, /senha foi atualizada/i);
});

test('login always delegates credentials to the authentication service', async () => {
  const app = harness();
  app.noSession();
  await assert.rejects(() => app.render().props.onLogin('legacy-test@example.invalid', 'arbitrary-password'));
  assert.equal(app.calls.signIns, 1);
  assert.equal(app.render().type, 'Login');
});

test('an expired recovery link displays login with a recovery error', () => {
  const app = harness({ pathname: '/reset-password' });
  app.noSession();
  assert.equal(app.render().type, 'Login');
  assert.match(app.render().props.errorMessage, /link.*inválido|expirou/i);
});

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function label(tree) {
  if (typeof tree === 'string') return tree;
  if (!tree || typeof tree !== 'object') return '';
  if (Array.isArray(tree)) return tree.map(label).join(' ');
  return label(tree.props?.children);
}
function button(tree, name) {
  const result = nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] || label(node).trim()) === name);
  assert.ok(result, `Button ${name} should exist`);
  return result;
}

test('Home resets dashboard subpanels and closes profile and password editing', async () => {
  const app = harness();
  app.emit('SIGNED_IN'); await settle();
  const initialKey = nodes(app.render()).find(node => node.type === 'Dashboard').props.resetKey;
  button(app.render(), 'Início').props.onClick();
  assert.equal(nodes(app.render()).find(node => node.type === 'Dashboard').props.resetKey, initialKey + 1);
  button(app.render(), 'Perfil').props.onClick();
  const profileButton = nodes(app.render()).find(node => node.type === 'button' && label(node).includes('Seus dados'));
  profileButton.props.onClick();
  assert.ok(nodes(app.render()).some(node => node.type === 'PersonalDataForm'));
  button(app.render(), 'Início').props.onClick();
  assert.ok(nodes(app.render()).some(node => node.type === 'Dashboard'));
  assert.equal(nodes(app.render()).some(node => node.type === 'PersonalDataForm'), false);
  button(app.render(), 'Perfil').props.onClick();
  nodes(app.render()).find(node => node.type === 'button' && label(node).includes('Atualizar senha')).props.onClick();
  assert.ok(nodes(app.render()).some(node => node.type === 'UpdatePasswordForm'));
  button(app.render(), 'Início').props.onClick();
  assert.equal(nodes(app.render()).some(node => node.type === 'UpdatePasswordForm'), false);
});

test('student theme controls stay synchronized across pages and persist after reopening the app', async () => {
  const preferences = new Map([['cadu_ponce_theme', 'light']]);
  const app = harness({ preferences });
  app.emit('SIGNED_IN'); await settle();
  assert.equal(app.render().props['data-theme'], 'light');

  button(app.render(), 'Ativar modo noturno').props.onClick();
  assert.equal(app.render().props['data-theme'], 'dark');
  assert.equal(preferences.get('cadu_ponce_theme'), 'dark');

  button(app.render(), 'Treinos').props.onClick();
  assert.ok(nodes(app.render()).some(node => node.type === 'WorkoutList'));
  assert.equal(app.render().props['data-theme'], 'dark');
  button(app.render(), 'Perfil').props.onClick();
  assert.equal(button(app.render(), 'Noturno').props['aria-pressed'], true);
  assert.equal(button(app.render(), 'Claro').props['aria-pressed'], false);

  button(app.render(), 'Claro').props.onClick();
  assert.equal(app.render().props['data-theme'], 'light');
  assert.equal(preferences.get('cadu_ponce_theme'), 'light');
  assert.equal(button(app.render(), 'Claro').props['aria-pressed'], true);
  button(app.render(), 'Noturno').props.onClick();
  button(app.render(), 'Início').props.onClick();
  assert.equal(app.render().props['data-theme'], 'dark');

  const reopened = harness({ preferences });
  reopened.emit('SIGNED_IN'); await settle();
  assert.equal(reopened.render().props['data-theme'], 'dark');
  assert.ok(button(reopened.render(), 'Ativar modo claro'));
});

test('student can change theme in memory when browser storage is unavailable', async () => {
  const app = harness({ storageBlocked: true });
  app.emit('SIGNED_IN'); await settle();
  assert.equal(app.render().props['data-theme'], 'light');
  button(app.render(), 'Ativar modo noturno').props.onClick();
  assert.equal(app.render().props['data-theme'], 'dark');
  assert.ok(nodes(app.render()).some(node => node.type === 'Dashboard'));
  button(app.render(), 'Perfil').props.onClick();
  assert.equal(button(app.render(), 'Noturno').props['aria-pressed'], true);
  button(app.render(), 'Claro').props.onClick();
  assert.equal(app.render().props['data-theme'], 'light');
  assert.equal(app.preferences.size, 0, 'failed writes are not reported as persisted');
});

test('profile update finishing after account switch cannot replace the current screen identity', async () => {
  for (const form of [false, true]) {
    const app = harness();
    app.emit('SIGNED_IN'); await settle();
    let component = nodes(app.render()).find(node => node.type === 'Dashboard');
    if (form) {
      button(app.render(), 'Perfil').props.onClick();
      nodes(app.render()).find(node => node.type === 'button' && label(node).includes('Seus dados')).props.onClick();
      component = nodes(app.render()).find(node => node.type === 'PersonalDataForm');
    }
    const save = (form ? component.props.onSave : component.props.onUpdateUser)({ ...component.props.user, name: 'Stale result' });
    app.switchCachedActor('student-b');
    app.finishUpdate();
    await assert.rejects(save, /sessão mudou/);
    assert.equal(nodes(app.render()).some(node => node.props?.user?.name === 'Stale result'), false);
  }
});

test('a direct account switch clears the previous student workout before showing the next session', async () => {
  const app = harness(); app.emit('SIGNED_IN'); await settle();
  nodes(app.render()).find(node => node.type === 'Dashboard').props.onStartWorkout({ id: 'private-a', studentId: 'student-a', name: 'Private prescription A', exercises: [] });
  assert.ok(nodes(app.render()).some(node => node.type === 'WorkoutSession'));
  app.switchUser('student-b');
  assert.equal(nodes(app.render()).some(node => node.type === 'WorkoutSession'), false);
  await settle();
  assert.equal(nodes(app.render()).some(node => node.props?.workout?.id === 'private-a'), false);
  assert.equal(nodes(app.render()).find(node => node.type === 'Dashboard').props.user.uid, 'student-b');
});

test('consulting screen only offers centralized WhatsApp and Instagram contact without plans or checkout', () => {
  const componentSource = readFileSync(new URL('../src/components/AcquireConsulting.tsx', import.meta.url), 'utf8');
  const componentCode = ts.transpileModule(componentSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const trainer = {
    name: 'Personal de teste', role: 'Personal Trainer', phone: '5500000000000',
    instagramHandle: 'personal_teste', instagramUrl: 'https://instagram.com/personal_teste',
  };
  const expectedMessage = 'Olá Cadu! Tenho interesse na consultoria e gostaria de conversar sobre os planos disponíveis.';
  const contactMessages = [];
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {},
    require(name) {
      if (name === 'react') return {};
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'motion/react') return { motion: { div: 'motion.div' } };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (name === '../lib/trainerConfig') return {
        TRAINER_CONFIG: trainer,
        getTrainerWhatsAppUrl: message => {
          contactMessages.push(message);
          return 'https://wa.me/' + trainer.phone + '?text=' + encodeURIComponent(message);
        },
      };
      throw new Error('Unexpected dependency in consulting flow: ' + name);
    },
  };
  vm.runInNewContext(componentCode, context);
  const flatten = item => !item || typeof item !== 'object' ? [] : Array.isArray(item)
    ? item.flatMap(flatten) : [item, ...flatten(item.props?.children)];
  let cancelled = false;
  const tree = context.exports.default({ onCancel() { cancelled = true; } });
  const nodes = flatten(tree);
  const visibleText = item => typeof item === 'string' || typeof item === 'number' ? String(item)
    : !item ? '' : Array.isArray(item) ? item.map(visibleText).join(' ') : visibleText(item.props?.children);
  const text = visibleText(tree).replace(/\s+/g, ' ').trim();
  assert.match(text, /Fale diretamente com o personal/i);
  assert.doesNotMatch(text, /R\$|\bmensal\b|trimestral|semestral|economize|valor total|cartão|Pix/i);
  assert.equal(nodes.filter(node => ['input', 'form', 'select', 'textarea'].includes(node.type)).length, 0);
  assert.equal(nodes.filter(node => 'aria-pressed' in node.props || node.props.role === 'radio').length, 0);
  assert.equal(nodes.filter(node => node.type === 'ul' || node.type === 'ol').length, 0);

  const contact = nodes.find(node => node.type === 'a' && node.props.id === 'btn-contact-whatsapp');
  const instagram = nodes.find(node => node.type === 'a' && node.props.id === 'btn-contact-instagram');
  assert.ok(contact, 'WhatsApp contact link is available');
  assert.ok(instagram, 'Instagram contact link is available');
  assert.equal(nodes.filter(node => node.type === 'a').length, 2);
  const target = new URL(contact.props.href);
  assert.equal(target.hostname, 'wa.me');
  assert.equal(target.pathname, '/' + trainer.phone);
  assert.equal(target.searchParams.get('text'), expectedMessage);
  assert.deepEqual(contactMessages, [expectedMessage]);
  assert.equal(instagram.props.href, trainer.instagramUrl);
  assert.equal(contact.props.rel, 'noopener noreferrer');
  assert.equal(instagram.props.rel, 'noopener noreferrer');
  assert.equal(contact.props.target, '_blank');
  assert.equal(instagram.props.target, '_blank');
  const back = nodes.find(node => node.type === 'button' && node.props.id === 'btn-quit-acquire');
  assert.ok(back);
  back.props.onClick();
  assert.equal(cancelled, true);
});
