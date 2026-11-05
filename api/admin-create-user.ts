import { bearerToken, boundedText, createServerClient, enforceRateLimit, HttpError,
  jsonBody, postOnly, requireAdmin, safeError } from '../server/security.js';

export function newUserInput(body: Record<string, unknown>) {
  const email = boundedText(body.email, 254, 'E-mail').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
  const name = boundedText(body.name, 120, 'Nome');
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 12 || password.length > 128) throw new HttpError(400, 'A senha deve ter de 12 a 128 caracteres.');
  const role = body.role ?? 'student';
  const status = body.status ?? 'active';
  if (!['student', 'admin'].includes(role as string) || !['active', 'inactive'].includes(status as string)) {
    throw new HttpError(400, 'Perfil inválido.');
  }
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
  const weight = body.weight == null ? null : Number(body.weight);
  const height = body.height == null ? null : Number(body.height);
  if ((weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) ||
      (height !== null && (!Number.isFinite(height) || height < 0 || height > 300))) throw new HttpError(400, 'Medidas inválidas.');
  return { email, name, password, role, status, metadata, weight, height,
    trainer_phone: typeof body.trainerPhone === 'string' ? body.trainerPhone.slice(0, 30) : null,
    modality: ['Online', 'Presencial'].includes(body.modality as string) ? body.modality : 'Online' };
}

export default async function handler(req: any, res: any) {
  if (!postOnly(req, res)) return;
  try {
    bearerToken(req);
    const client = createServerClient();
    const admin = await requireAdmin(req, client);
    const input = newUserInput(jsonBody(req));
    await enforceRateLimit(client, admin.id, 'create-user');
    const { data, error } = await client.auth.admin.createUser({
      email: input.email, password: input.password, email_confirm: true,
      user_metadata: { name: input.name },
    });
    if (error || !data.user) throw new HttpError(400, 'Não foi possível criar a conta. Verifique o e-mail e a senha.');
    const { password: _password, ...profile } = input;
    const { data: saved, error: saveError } = await client.from('profiles')
      .upsert({ ...profile, id: data.user.id }).select('*').single();
    if (saveError || !saved) {
      const { error: cleanupError } = await client.auth.admin.deleteUser(data.user.id);
      throw new HttpError(503, cleanupError
        ? 'A conta foi criada parcialmente. Revise o cadastro no painel antes de tentar novamente.'
        : 'O perfil não pôde ser salvo. Nenhuma conta foi mantida; tente novamente.');
    }
    return res.status(201).json({ user: saved });
  } catch (error) { return safeError(res, error); }
}
