import { withTestEnvironment, assertTestResult } from './scripts/test-environment.mjs';
await withTestEnvironment(async ({ client, user }) => {
  const profile = assertTestResult(await client.from('profiles').select('metadata').eq('id', user.id).single());
  assertTestResult(await client.from('profiles').update({ metadata: { ...profile.metadata, testDiagnostic: true } }).eq('id', user.id).select('id').single());
  console.log('Atualização de metadados da conta de teste concluída.');
}, { write: true });
