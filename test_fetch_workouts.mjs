import { withTestEnvironment, assertTestResult } from './scripts/test-environment.mjs';
await withTestEnvironment(async ({ client, user }) => {
  const result = await client.from('workouts').select('id', { count: 'exact', head: true }).eq('student_id', user.id);
  assertTestResult(result);
  console.log('Consulta de treinos da conta de teste concluída. Quantidade:', result.count ?? 0);
});
