import { randomUUID } from 'node:crypto';
import { withTestEnvironment, assertTestResult, insertWorkoutFixture } from './scripts/test-environment.mjs';
await withTestEnvironment(async ({ client, user }) => {
  const workoutId = await insertWorkoutFixture(client, user);
  assertTestResult(await client.from('exercises').insert({
    id: randomUUID(), workout_id: workoutId, name: 'Exercício de diagnóstico', sets: 3, reps: '10', rest: '60s',
  }));
  console.log('Inserção de treino e exercício concluída no ambiente de testes.');
}, { write: true });
