import { withTestEnvironment, assertTestResult } from './scripts/test-environment.mjs';
await withTestEnvironment(async ({ client, user }) => {
  assertTestResult(await client.from('profiles').update({ height: 180 }).eq('id', user.id).select('id').single());
  console.log('Atualização do perfil da conta de teste concluída.');
}, { write: true });
