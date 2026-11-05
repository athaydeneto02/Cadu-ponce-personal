import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const root = new URL('../', import.meta.url);
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
class TestConfigurationError extends Error {}

function readEnvironmentFile(name) {
  const path = new URL(name, root);
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

/** Pure validation; no clients, requests, or credential output. */
export function getTestConfiguration(env, productionUrls = [], { write = false } = {}) {
  for (const key of ['TEST_SUPABASE_URL', 'TEST_SUPABASE_ANON_KEY', 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD']) {
    if (!env[key]?.trim()) throw new TestConfigurationError('Configure as quatro variáveis TEST_ descritas em docs/test-environment.md.');
  }
  let url;
  try { url = new URL(env.TEST_SUPABASE_URL); }
  catch { throw new TestConfigurationError('TEST_SUPABASE_URL deve ser uma URL válida.'); }
  const local = localHosts.has(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TestConfigurationError('Use somente a origem do servidor de teste, sem credenciais, caminho ou parâmetros.');
  }
  if ((!local && url.protocol !== 'https:') || (local && !['http:', 'https:'].includes(url.protocol))) {
    throw new TestConfigurationError('Projetos remotos de teste exigem HTTPS.');
  }
  const productionHosts = [...productionUrls, env.VITE_SUPABASE_URL, env.TEST_PRODUCTION_SUPABASE_URL].filter(Boolean).map(value => {
    try { return new URL(value).hostname; } catch { return ''; }
  });
  if (!local && productionHosts.includes(url.hostname)) {
    throw new TestConfigurationError('O projeto configurado é usado pela aplicação. Escolha outro projeto exclusivo para testes.');
  }
  if (!local && env.TEST_ALLOWED_HOST !== url.hostname) {
    throw new TestConfigurationError('Confirme o hostname do projeto separado em TEST_ALLOWED_HOST.');
  }
  const key = env.TEST_SUPABASE_ANON_KEY.trim();
  let jwtRole;
  try { jwtRole = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()).role; } catch { /* publishable key */ }
  if (key.startsWith('sb_secret_') || jwtRole === 'service_role') {
    throw new TestConfigurationError('Use apenas a chave anon/publicável do projeto de testes, nunca uma chave privilegiada.');
  }
  if (write && env.TEST_ALLOW_WRITES !== 'true') {
    throw new TestConfigurationError('Operações de escrita exigem TEST_ALLOW_WRITES=true no ambiente de testes.');
  }
  return { url: url.origin, anonKey: key, email: env.TEST_USER_EMAIL.trim(), password: env.TEST_USER_PASSWORD };
}

export function assertTestResult(result) {
  if (result.error) {
    const code = result.error.code;
    const error = new Error('A operação no ambiente de testes falhou.');
    if (typeof code === 'string' && /^[A-Za-z0-9_]{1,50}$/.test(code)) error.code = code;
    throw error;
  }
  return result.data;
}

/** Manual diagnostics are isolated from app .env and never print rows or credentials. */
export async function withTestEnvironment(action, { write = false, authenticate = true } = {}) {
  try {
    const env = { ...readEnvironmentFile('.env.test.local'), ...process.env };
    const productionUrls = ['.env', '.env.local', '.env.production', '.env.production.local']
      .map(name => readEnvironmentFile(name).VITE_SUPABASE_URL).filter(Boolean);
    const config = getTestConfiguration(env, productionUrls, { write });
    const client = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let user = null;
    if (authenticate) {
      const data = assertTestResult(await client.auth.signInWithPassword({ email: config.email, password: config.password }));
      user = data.user;
      if (!user) throw new Error('A conta de teste não iniciou uma sessão.');
    }
    await action({ client, user, config });
  } catch (error) {
    // Supabase/network errors can contain addresses or query values. Do not dump them.
    console.error(error instanceof TestConfigurationError ? error.message : 'Diagnóstico não concluído. Confira a configuração de testes e as permissões da conta.');
    if (typeof error?.code === 'string' && /^[A-Za-z0-9_]{1,50}$/.test(error.code)) console.error('Código:', error.code);
    process.exitCode = 1;
  }
}

export async function insertWorkoutFixture(client, user) {
  const id = randomUUID();
  assertTestResult(await client.from('workouts').insert({ id, student_id: user.id, name: 'Diagnóstico de treino (ambiente de teste)' }));
  return id;
}

export async function runWorkoutInsertCheck() {
  await withTestEnvironment(async ({ client, user }) => {
    await insertWorkoutFixture(client, user);
    console.log('Inserção de treino concluída no ambiente de testes.');
  }, { write: true });
}
