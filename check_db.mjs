import { withTestEnvironment, assertTestResult } from './scripts/test-environment.mjs';
await withTestEnvironment(async ({ client }) => {
  for (const table of ['profiles', 'workouts', 'exercises']) {
    const result = await client.from(table).select('id', { count: 'exact', head: true });
    assertTestResult(result);
    console.log(table + ': ' + (result.count ?? 0) + ' registros acessíveis no ambiente de testes.');
  }
});
