import { withTestEnvironment, assertTestResult } from './scripts/test-environment.mjs';
// Schema changes belong to reviewed SQL migrations, not ad-hoc client scripts.
await withTestEnvironment(async ({ client }) => {
  assertTestResult(await client.from('workout_logs').select('id', { head: true }).limit(1));
  console.log('Tabela de histórico acessível. Para criar ou alterar o esquema, aplique as migrações no ambiente de testes.');
});
