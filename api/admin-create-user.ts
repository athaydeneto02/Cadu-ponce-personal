import { bearerToken, boundedText, createServerClient, enforceRateLimit, HttpError,
  jsonBody, postOnly, requireAdmin, safeError } from '../server/security.js';
import { normalizeStudentPhone } from '../src/lib/studentContact.js';

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
  const rawMetadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
  let phone = '';
  try { phone = normalizeStudentPhone(typeof rawMetadata.phone === 'string' ? rawMetadata.phone : ''); }
  catch { throw new HttpError(400, 'WhatsApp do aluno inválido.'); }
  const birthDate = typeof rawMetadata.birthDate === 'string' ? rawMetadata.birthDate : '';
  if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(Date.parse(birthDate)) || new Date(birthDate).toISOString().slice(0, 10) !== birthDate)) throw new HttpError(400, 'Data de nascimento inválida.');
  const metadata = { phone, birthDate,
    group: typeof rawMetadata.group === 'string' ? rawMetadata.group.slice(0, 120) : '',
    gender: typeof rawMetadata.gender === 'string' ? rawMetadata.gender.slice(0, 80) : '' };
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
      .upsert({ ...profile, id: data.user.id }).select('id,name,email,photo_url,weight,height,trainer_phone,role,status,modality,metadata,created_at').single();
    if (saveError || !saved) {
      const { error: cleanupError } = await client.auth.admin.deleteUser(data.user.id);
      throw new HttpError(503, cleanupError
        ? 'A conta foi criada parcialmente. Revise o cadastro no painel antes de tentar novamente.'
        : 'O perfil não pôde ser salvo. Nenhuma conta foi mantida; tente novamente.');
    }
    return res.status(201).json({ user: saved });
  } catch (error) { return safeError(res, error); }
}
