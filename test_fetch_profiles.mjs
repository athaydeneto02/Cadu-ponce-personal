import { withTestEnvironment, assertTestResult } from './scripts/test-environment.mjs';
await withTestEnvironment(async ({ client }) => {
  const result = await client.from('profiles').select('id', { count: 'exact', head: true });
  assertTestResult(result);
  console.log('Consulta de perfis concluída. Registros acessíveis:', result.count ?? 0);
});
