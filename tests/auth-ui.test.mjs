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

function harness({ profileRole = 'student', status = 'active', pathname = '/', profileFailure = false, verified = true } = {}) {
  const state = [];
  const effects = [];
  const calls = { profileReads: 0, signIns: 0, scopes: [] };
  let cursor = 0;
  let firstRender = true;
  let authCallback;
  let resolveProfile;
  let delayedProfile = false;
  const user = { id: 'student-a', email: 'cadu-client@example.invalid', user_metadata: { role: 'admin' } };
  const profile = { uid: user.id, name: 'Aluno', email: user.email, role: profileRole, status, createdAt: '2026-01-01' };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (firstRender) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect(effect) { if (firstRender) effects.push(effect); },
  };
  const storage = {
    getUser: () => ({ ...profile, role: 'admin' }),
    setSessionUser: id => calls.scopes.push(id),
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
  const jsx = (type, props) => ({ type, props });
  const location = { pathname };
  const context = {
    exports: {},
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === './lib/supabase') return { supabase };
      if (name === './lib/storage') return { storage };
      if (name === 'motion/react') return { motion: new Proxy({}, { get: (_, key) => 'motion.' + String(key) }), AnimatePresence: 'AnimatePresence' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      return { default: name.split('/').pop() };
    },
    window: { location, history: { replaceState(_state, _unused, path) { location.pathname = path; } }, addEventListener() {}, removeEventListener() {} },
    navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(compiled, context, { filename: 'App.js' });
  const render = () => { cursor = 0; const result = context.exports.default(); firstRender = false; return result; };
  render();
  effects.forEach(effect => effect());
  return {
    render, calls,
    emit: event => authCallback(event, { user, access_token: 'test-only-token' }),
    signOut: () => authCallback('SIGNED_OUT', null),
    noSession: () => authCallback('INITIAL_SESSION', null),
    delayProfile: () => { delayedProfile = true; },
    finishProfile: () => resolveProfile(profile),
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

test('consulting plans only prepare WhatsApp contact with the selected plan', () => {
  const componentSource = readFileSync(new URL('../src/components/AcquireConsulting.tsx', import.meta.url), 'utf8');
  const componentCode = ts.transpileModule(componentSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let selected;
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {},
    require(name) {
      if (name === 'react') return { useState: initial => [selected ?? initial, value => { selected = value; }] };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'motion/react') return { motion: { div: 'motion.div' } };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (name === '../lib/trainerConfig') return { getTrainerWhatsAppUrl: message => 'https://wa.me/5500000000000?text=' + encodeURIComponent(message) };
      throw new Error('Unexpected dependency in consulting flow: ' + name);
    },
  };
  vm.runInNewContext(componentCode, context);
  const flatten = item => !item || typeof item !== 'object' ? [] : Array.isArray(item)
    ? item.flatMap(flatten) : [item, ...flatten(item.props?.children)];
  const render = () => flatten(context.exports.default({ onCancel() {} }));
  let nodes = render();
  assert.equal(nodes.filter(node => node.type === 'input').length, 0);
  const plans = nodes.filter(node => node.type === 'button' && 'aria-pressed' in node.props);
  assert.equal(plans.length, 3);
  plans[0].props.onClick();
  nodes = render();
  const contact = nodes.find(node => node.type === 'a' && node.props.id === 'btn-plans-continue');
  const target = new URL(contact.props.href);
  assert.equal(target.hostname, 'wa.me');
  assert.match(target.searchParams.get('text'), /Mensal/);
  assert.match(target.searchParams.get('text'), /149,90/);
  assert.equal(contact.props.rel, 'noopener noreferrer');
});
