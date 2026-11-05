import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** High-confidence credentials only. Never print the matched value. */
export function secretKinds(source) {
  const found = new Set();
  const patterns = [
    ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/],
    ['Supabase management token', /sbp_[a-f0-9]{30,}/],
    ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}/],
    ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
    ['Private VAPID key', /VAPID_PRIVATE_KEY["']?\s*(?:=|:)\s*["']?[A-Za-z0-9_-]{40,}/],
  ];
  for (const [kind, pattern] of patterns) if (pattern.test(source)) found.add(kind);
  for (const token of source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
    try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'service_role') found.add('Privileged Supabase JWT'); }
    catch { /* Non-JWT source text. */ }
  }
  return [...found];
}

function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    if (!/\.(?:[cm]?[jt]sx?|json|sql|ya?ml|md|txt|html|env)$|(?:^|[\\/])\.env(?:\.|$)/i.test(file)) continue;
    for (const kind of secretKinds(readFileSync(file, 'utf8'))) findings.push({ file, kind });
  }
  return findings;
}

function bundleFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? bundleFiles(file) : [file];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const files = process.argv.includes('--bundle') ? bundleFiles('dist')
    : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const findings = scanFiles(files);
  if (findings.length) {
    console.error(JSON.stringify({ error: 'Credential-like value detected; revoke it and remove it before publishing.', findings }));
    process.exitCode = 1;
  } else console.log(`Credential scan: ${files.length} files checked, no high-confidence secrets found.`);
}
