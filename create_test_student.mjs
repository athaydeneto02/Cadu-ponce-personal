import { withTestEnvironment, assertTestResult } from './scripts/test-environment.mjs';
await withTestEnvironment(async ({ client, config }) => {
  const data = assertTestResult(await client.auth.signUp({
    email: config.email,
    password: config.password,
    options: { data: { name: 'Aluno de teste' } },
  }));
  if (!data.user) throw new Error('Conta não criada.');
  console.log('Cadastro de teste solicitado. Confira a confirmação de e-mail e a ativação no ambiente de testes.');
}, { write: true, authenticate: false });
