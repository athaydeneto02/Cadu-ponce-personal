import { withTestEnvironment, assertTestResult } from './scripts/test-environment.mjs';
await withTestEnvironment(async ({ client, user }) => {
  const profile = assertTestResult(await client.from('profiles').select('id').eq('id', user.id).maybeSingle());
  console.log('Perfil da conta de teste encontrado:', Boolean(profile));
});
