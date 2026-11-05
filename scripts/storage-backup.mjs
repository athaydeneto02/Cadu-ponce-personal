import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const objectKey = object => digest(`${object.bucket}\0${object.name}`);
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const fail = message => { throw new Error(message); };
const unwrap = response => {
  if (response.error) fail('A operação de Storage falhou. O backup/restauro não foi concluído.');
  return response.data;
};
function origin(value) {
  let url;
  try { url = new URL(value); } catch { fail('Configure uma origem Supabase válida.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (!localHosts.has(url.hostname) && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol)) fail('Use uma origem HTTPS (ou HTTP localhost), sem caminho nem credenciais.');
  return url;
}
export function restoreConfiguration(env, apply = false) {
  const url = origin(env.RESTORE_SUPABASE_URL);
  // This executable intentionally cannot restore into a hosted project, including production.
  if (!localHosts.has(url.hostname)) fail('O ensaio de restauração só aceita localhost, 127.0.0.1 ou ::1.');
  if (apply && env.RESTORE_ALLOW_WRITES !== 'true') fail('Para executar o ensaio local, defina RESTORE_ALLOW_WRITES=true.');
  if (!env.RESTORE_SUPABASE_SERVICE_KEY) fail('Configure a chave privilegiada SOMENTE do Supabase local.');
  return { url: url.origin, key: env.RESTORE_SUPABASE_SERVICE_KEY };
}
function encryptionKey(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 20) fail('BACKUP_PASSPHRASE deve ter pelo menos 20 caracteres; mantenha-a fora do backup.');
  return scryptSync(passphrase, salt, 32);
}
function encrypt(bytes, key, aad) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
function decrypt(bytes, key, aad) {
  try {
    if (bytes.length < 28) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28)); cipher.setAAD(Buffer.from(aad));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
  } catch { fail('Senha incorreta ou arquivo cifrado corrompido. Nenhum restauro foi autorizado.'); }
}
function safeObjectName(value) {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !/[\0-\x1f\\]/.test(value) && !value.split('/').some(part => part === '..' || part === '.');
}
async function outsideRepository(directory) {
  if (!path.isAbsolute(directory)) fail('Use um diretório absoluto fora do repositório.');
  const parent = await realpath(path.dirname(directory));
  const repo = await realpath(repository);
  const relative = path.relative(repo, parent);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) fail('Backups não podem ser gravados dentro do repositório.');
  return path.join(parent, path.basename(directory));
}

/** Complete paginated inventory. Folder entries have no object id. No row content is logged. */
export async function inventory(client, pageSize = 1000) {
  const bucketRows = [];
  for (let offset = 0; ; offset += pageSize) {
    const rows = unwrap(await client.storage.listBuckets({ limit: pageSize, offset, sortColumn: 'id', sortOrder: 'asc' }));
    if (!Array.isArray(rows)) fail('Listagem de buckets inválida.');
    bucketRows.push(...rows);
    if (rows.length < pageSize) break;
  }
  const buckets = bucketRows.map(bucket => ({
    id: bucket.id, public: !!bucket.public, fileSizeLimit: bucket.file_size_limit ?? undefined,
    allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
  })).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(buckets.map(bucket => bucket.id)).size !== buckets.length) fail('A listagem retornou buckets duplicados.');
  const objects = [];
  for (const bucket of buckets) {
    if (!safeObjectName(bucket.id) || bucket.id.includes('/')) fail('Identificador de bucket inválido.');
    const folders = [''], seen = new Set();
    while (folders.length) {
      const prefix = folders.shift();
      if (seen.has(prefix)) fail('Ciclo inesperado na listagem de arquivos.');
      seen.add(prefix);
      for (let offset = 0; ; offset += pageSize) {
        const rows = unwrap(await client.storage.from(bucket.id).list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } }));
        if (!Array.isArray(rows)) fail('Listagem de arquivos inválida.');
        for (const row of rows) {
          const name = prefix ? `${prefix}/${row.name}` : row.name;
          if (!safeObjectName(name)) fail('Nome de objeto não suportado pelo procedimento.');
          if (row.id == null) folders.push(name);
          else objects.push({ bucket: bucket.id, name, id: row.id, updatedAt: row.updated_at,
            size: Number(row.metadata?.size), contentType: row.metadata?.mimetype || 'application/octet-stream' });
        }
        if (rows.length < pageSize) break;
      }
    }
  }
  objects.sort((a, b) => objectKey(a).localeCompare(objectKey(b)));
  if (new Set(objects.map(objectKey)).size !== objects.length) fail('A listagem retornou objetos duplicados.');
  return { buckets, objects };
}

/** Read-only source export. A completed manifest is published only after inventory stability and all files succeed. */
export async function exportStorage({ client, directory, passphrase, sourceUrl, pageSize = 1000, maxObjectBytes = 128 * 1024 * 1024 }) {
  const source = origin(sourceUrl).origin;
  const salt = randomBytes(16), key = encryptionKey(passphrase, salt);
  const output = await outsideRepository(directory);
  await mkdir(output, { mode: 0o700 }); // Refuse reuse/overwriting an existing backup.
  await mkdir(path.join(output, 'objects'), { mode: 0o700 });
  const startedAt = new Date().toISOString();
  await writeFile(path.join(output, 'backup.json'), JSON.stringify({ version: 1, status: 'incomplete', startedAt }), { flag: 'wx', mode: 0o600 });
  const before = await inventory(client, pageSize), files = [];
  for (const object of before.objects) {
    if (!Number.isFinite(object.size) || object.size < 0 || object.size > maxObjectBytes) fail('Objeto sem tamanho válido ou acima do limite de memória. Backup incompleto.');
    const blob = unwrap(await client.storage.from(object.bucket).download(object.name));
    if (blob.size !== object.size || blob.size > maxObjectBytes) fail('O tamanho do objeto mudou durante o backup. Refaça em uma janela sem gravações.');
    const bytes = Buffer.from(await blob.arrayBuffer()), file = { ...object, sha256: digest(bytes) };
    await writeFile(path.join(output, 'objects', objectKey(file) + '.enc'), encrypt(bytes, key, objectKey(file)), { flag: 'wx', mode: 0o600 });
    files.push(file);
  }
  const after = await inventory(client, pageSize);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('O inventário mudou durante o backup. O diretório permanece marcado como incompleto.');
  const manifest = { version: 1, source, startedAt, completedAt: new Date().toISOString(), buckets: before.buckets, objects: files };
  await writeFile(path.join(output, 'manifest.enc'), encrypt(Buffer.from(JSON.stringify(manifest)), key, 'manifest-v1'), { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(output, 'backup.json'), JSON.stringify({ version: 1, status: 'complete', salt: salt.toString('hex'), startedAt, completedAt: manifest.completedAt }), { mode: 0o600 });
  return { buckets: manifest.buckets.length, objects: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) };
}

async function loadBackup(directory, passphrase) {
  const index = JSON.parse(await readFile(path.join(directory, 'backup.json'), 'utf8'));
  if (index.version !== 1 || index.status !== 'complete' || !/^[a-f0-9]{32}$/.test(index.salt)) fail('Backup incompleto ou formato inválido.');
  const key = encryptionKey(passphrase, Buffer.from(index.salt, 'hex'));
  const manifest = JSON.parse(decrypt(await readFile(path.join(directory, 'manifest.enc')), key, 'manifest-v1').toString('utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.buckets) || !Array.isArray(manifest.objects)) fail('Manifesto inválido.');
  const bucketIds = new Set(manifest.buckets.map(bucket => bucket.id));
  if (bucketIds.size !== manifest.buckets.length || manifest.buckets.some(bucket => !safeObjectName(bucket.id) || bucket.id.includes('/'))) fail('Buckets inválidos no manifesto.');
  if (new Set(manifest.objects.map(objectKey)).size !== manifest.objects.length) fail('Objetos duplicados no manifesto.');
  for (const object of manifest.objects) {
    if (!bucketIds.has(object.bucket) || !safeObjectName(object.name) || !Number.isSafeInteger(object.size) || object.size < 0 || !/^[a-f0-9]{64}$/.test(object.sha256)) fail('Objeto inválido no manifesto.');
  }
  return { manifest, key };
}
async function objectBytes(directory, object, key) {
  const bytes = decrypt(await readFile(path.join(directory, 'objects', objectKey(object) + '.enc')), key, objectKey(object));
  if (bytes.length !== object.size || digest(bytes) !== object.sha256) fail('A integridade de um objeto não confere.');
  return bytes;
}
export async function verifyStorage({ directory, passphrase }) {
  const { manifest, key } = await loadBackup(directory, passphrase);
  for (const object of manifest.objects) await objectBytes(directory, object, key);
  return { buckets: manifest.buckets.length, objects: manifest.objects.length, bytes: manifest.objects.reduce((sum, object) => sum + object.size, 0) };
}

/** Preflight by default. Real writes only to explicitly configured local Supabase; never overwrite objects. */
export async function restoreStorage({ client, directory, passphrase, env, apply = false }) {
  restoreConfiguration(env, apply);
  const summary = await verifyStorage({ directory, passphrase });
  const { manifest, key } = await loadBackup(directory, passphrase);
  const destination = await inventory(client);
  const existingBuckets = new Map(destination.buckets.map(bucket => [bucket.id, bucket]));
  const expected = new Map(manifest.objects.map(object => [objectKey(object), object]));
  const existing = new Set();
  // Check every collision before the first mutation. Existing identical objects make a retry safe.
  for (const bucket of manifest.buckets) {
    const previous = existingBuckets.get(bucket.id);
    if (previous && previous.public !== bucket.public) fail('O destino contém bucket com configuração de privacidade diferente. Use um ambiente local vazio.');
  }
  for (const object of destination.objects) {
    if (!manifest.buckets.some(bucket => bucket.id === object.bucket)) continue;
    const wanted = expected.get(objectKey(object));
    if (!wanted) fail('O destino possui arquivos adicionais. Use um ambiente local vazio.');
    const blob = unwrap(await client.storage.from(object.bucket).download(object.name));
    if (digest(Buffer.from(await blob.arrayBuffer())) !== wanted.sha256) fail('Existe arquivo diferente no destino. Nenhum arquivo será sobrescrito.');
    existing.add(objectKey(object));
  }
  if (!apply) return { ...summary, mode: 'preflight', writes: 0 };
  for (const bucket of manifest.buckets) if (!existingBuckets.has(bucket.id)) unwrap(await client.storage.createBucket(bucket.id, {
    public: bucket.public, fileSizeLimit: bucket.fileSizeLimit, allowedMimeTypes: bucket.allowedMimeTypes,
  }));
  for (const object of manifest.objects) {
    if (existing.has(objectKey(object))) continue;
    const bytes = await objectBytes(directory, object, key);
    unwrap(await client.storage.from(object.bucket).upload(object.name, bytes, { contentType: object.contentType, upsert: false }));
  }
  for (const object of manifest.objects) {
    const restored = unwrap(await client.storage.from(object.bucket).download(object.name));
    if (digest(Buffer.from(await restored.arrayBuffer())) !== object.sha256) fail('A verificação após o restauro falhou. Revise o ambiente local.');
  }
  return { ...summary, mode: 'restored-and-verified', writes: manifest.objects.length - existing.size };
}

async function main() {
  const [command, directory, flag] = process.argv.slice(2), env = process.env;
  if (!['export', 'verify', 'restore'].includes(command) || !directory || (flag && flag !== '--apply')) fail('Uso: node scripts/storage-backup.mjs export|verify|restore DIRETORIO_ABSOLUTO [--apply]');
  const passphrase = env.BACKUP_PASSPHRASE;
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120_000), redirect: 'error' }) } };
  let result;
  if (command === 'verify') result = await verifyStorage({ directory, passphrase });
  else if (command === 'export') {
    const url = origin(env.BACKUP_SUPABASE_URL).origin;
    if (!env.BACKUP_SUPABASE_SERVICE_KEY) fail('Configure BACKUP_SUPABASE_SERVICE_KEY explicitamente; .env não é carregado.');
    const client = createClient(url, env.BACKUP_SUPABASE_SERVICE_KEY, options);
    result = await exportStorage({ client, directory, passphrase, sourceUrl: url });
  } else {
    const apply = flag === '--apply', config = restoreConfiguration(env, apply);
    result = await restoreStorage({ client: createClient(config.url, config.key, options), directory, passphrase, env, apply });
  }
  console.log(JSON.stringify({ status: 'ok', command, ...result })); // Counts only; no names, source URLs or credentials.
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Operação não concluída. Confira a configuração e docs/backup-restore.md. Não considere este backup/restauro validado.'); process.exitCode = 1; });
}
