import { withTestEnvironment } from './scripts/test-environment.mjs';
// Kept as a compatibility entry point; credentials now always come from TEST_ variables.
await withTestEnvironment(async () => {
  console.log('Autenticação da conta de teste concluída.');
});
