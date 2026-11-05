import { createServerClient } from '../server/security.js';
import { createHealthHandler } from '../server/health.js';

export default createHealthHandler(async () => {
  const client = createServerClient();
  const { error } = await client.from('student_notifications').select('id', { head: true }).limit(1).abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error('Database unavailable');
});
