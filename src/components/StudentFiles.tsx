import React, { useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import type { StudentFile } from '../types';
import { storage } from '../lib/storage';
import { resolveMediaUrl } from '../lib/mediaDb';
import StudentResourcePage, { useStudentResource } from './StudentResourcePage';

export default function StudentFiles({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const data = useStudentResource(studentId, storage.fetchStudentFiles);
  const [busy, setBusy] = useState('');
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [category, setCategory] = useState('Arquivos diversos');
  const [download, setDownload] = useState<{ name: string; url: string } | null>(null);
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = '';
    if (!files.length || lock.current) return;
    lock.current = true; setBusy('upload'); setError(''); setNotice('');
    const failures: string[] = []; let savedCount = 0;
    try {
      for (const file of files) {
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error('O limite é 20 MB por arquivo.');
          const saved = await storage.uploadStudentFile(studentId, file, category);
          data.setItems(items => [saved, ...items.filter(item => item.id !== saved.id)]); savedCount++;
        } catch (failure) { failures.push(`${file.name}: ${failure instanceof Error ? failure.message : 'não foi possível enviar'}`); }
      }
      if (savedCount) setNotice(`${savedCount} arquivo(s) salvo(s) e disponível(is) para o personal.`);
      if (failures.length) setError(failures.join(' '));
    } finally { lock.current = false; setBusy(''); }
  };
  const open = async (file: StudentFile) => {
    if (lock.current) return;
    lock.current = true; setBusy(file.id); setError(''); setDownload(null);
    const actor = storage.getUser()?.uid;
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const reference = file.storagePath.startsWith('storage://') ? file.storagePath : `storage://arquivos-alunos/${file.storagePath}`;
      const url = await resolveMediaUrl(reference);
      if (!actor || actor !== storage.getUser()?.uid) throw new Error('A sessão mudou. Entre novamente para abrir o arquivo.');
      if (!url) throw new Error('Não foi possível abrir o arquivo. Verifique a conexão e tente novamente.');
      if (tab) tab.location.href = url;
      else setDownload({ name: file.name, url });
    } catch (failure) { tab?.close(); setError(failure instanceof Error ? failure.message : 'Não foi possível abrir o arquivo.'); }
    finally { lock.current = false; setBusy(''); }
  };
  const remove = async (file: StudentFile) => {
    if (lock.current || !window.confirm(`Excluir o arquivo “${file.name}”?`)) return;
    lock.current = true; setBusy(file.id); setError('');
    try { await storage.deleteStudentFile(file.id); data.setItems(items => items.filter(item => item.id !== file.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível excluir o arquivo.'); }
    finally { lock.current = false; setBusy(''); }
  };
  return <StudentResourcePage title="Arquivos" onBack={onBack} loading={data.loading} error={error || data.error} onRefresh={data.reload}>
    <div className="bg-white rounded-xl p-4 space-y-3">
      <p className="text-sm text-slate-600">Envie documentos ao personal e abra os arquivos compartilhados com você. Limite: 20 MB por arquivo.</p>
      <label className="block text-sm font-semibold text-slate-700">Categoria
        <select value={category} onChange={event => setCategory(event.target.value)} disabled={!!busy} className="block w-full border rounded-lg p-2 mt-1">
          {['Planos alimentares', 'Exames médicos', 'Planners', 'Arquivos diversos'].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className={`flex gap-2 items-center justify-center bg-blue-600 text-white rounded-xl p-3 font-semibold ${busy ? 'opacity-50' : 'cursor-pointer'}`}>
        <Upload className="w-4 h-4" />{busy === 'upload' ? 'Enviando...' : 'Adicionar arquivos'}
        <input type="file" multiple disabled={!!busy} onChange={upload} className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.mp4,.mov" />
      </label>
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      {download && <a href={download.url} target="_blank" rel="noopener noreferrer" className="block text-blue-700 underline">Abrir {download.name}</a>}
    </div>
    {!data.loading && !data.error && !data.items.length && <p className="bg-white rounded-xl p-6 text-slate-600 text-center">Nenhum arquivo compartilhado ainda.</p>}
    {data.items.map(file => <article key={file.id} className="bg-white rounded-xl p-4 flex items-start gap-3">
      <FileText className="w-5 h-5 text-blue-600 shrink-0" /><div className="min-w-0 flex-1">
        <h3 className="font-semibold text-slate-800 break-words">{file.name}</h3>
        <p className="text-xs text-slate-500 mt-1">{file.category || 'Arquivo'} · {(file.size / 1024 / 1024).toFixed(1)} MB · {new Date(file.createdAt).toLocaleDateString('pt-BR')}</p>
        <button onClick={() => void open(file)} disabled={!!busy} className="text-blue-700 font-semibold text-sm mt-3 disabled:opacity-40">{busy === file.id ? 'Aguarde...' : 'Abrir arquivo'}</button>
      </div><button onClick={() => void remove(file)} disabled={!!busy} aria-label={`Excluir ${file.name}`} className="p-2 text-red-600 disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
    </article>)}
  </StudentResourcePage>;
}
