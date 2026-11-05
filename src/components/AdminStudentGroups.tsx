import React, { useRef, useState } from 'react';
import type { UserProfile } from '../types';
import { storage } from '../lib/storage';

export default function AdminStudentGroups({ users, onSaved, onOpen }: { users: UserProfile[]; onSaved: (user: UserProfile) => void; onOpen: (user: UserProfile) => void }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const students = users.filter(user => user.role === 'student' && user.status !== 'excluded');
  const groups = [...new Set(students.map(user => user.metadata?.group || 'Sem grupo'))].sort();
  const apply = async (event: React.FormEvent) => {
    event.preventDefault(); if (lock.current || !selected.length) return;
    lock.current = true; setBusy(true); setMessage('');
    let saved = 0;
    try {
      // Merge into fresh profiles to preserve edits made since this panel was opened.
      const fresh = await storage.fetchUsersList({ allowCached: false });
      for (const id of selected) {
        const user = fresh.find(item => item.uid === id && item.role === 'student');
        if (!user) throw new Error('Um aluno não está mais disponível. Atualize a lista.');
        const updated = { ...user, metadata: { ...user.metadata, group: name.trim() } };
        await storage.updateProfile(updated); onSaved(updated); saved++;
      }
      setMessage(`${saved} aluno(s) atualizado(s).`); setSelected([]); setName('');
    } catch (error) { setMessage(`${saved} aluno(s) atualizado(s). ${error instanceof Error ? error.message : 'Falha ao salvar os demais alunos. Tente novamente.'}`); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="space-y-4 text-slate-900">
    <form onSubmit={apply} className="space-y-3 bg-white rounded-xl border p-4"><fieldset disabled={busy} className="space-y-3">
      <h3 className="font-bold">Organizar grupos</h3><p className="text-xs text-slate-500">Cada aluno pode pertencer a um grupo. Deixe o nome vazio para retirar os selecionados de seus grupos. A modalidade Online/Presencial é independente.</p>
      <label className="block text-sm">Nome do grupo<input maxLength={120} value={name} onChange={event => setName(event.target.value)} className="block w-full border rounded p-2" list="student-group-names" /></label><datalist id="student-group-names">{groups.filter(group => group !== 'Sem grupo').map(group => <option key={group}>{group}</option>)}</datalist>
      <div className="max-h-48 overflow-y-auto space-y-2">{students.map(user => <label className="flex gap-2 text-sm" key={user.uid}><input type="checkbox" checked={selected.includes(user.uid)} onChange={event => setSelected(previous => event.target.checked ? [...previous, user.uid] : previous.filter(id => id !== user.uid))} />{user.name} ({user.metadata?.group || 'Sem grupo'})</label>)}</div>
      <button disabled={!selected.length || busy} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">{busy ? 'Salvando…' : 'Aplicar aos selecionados'}</button>
    </fieldset></form>
    {message && <p role="status" className="text-sm bg-blue-50 rounded p-3">{message}</p>}
    {groups.map(group => <article key={group} className="bg-white border rounded-xl p-4"><h4 className="font-bold mb-2">{group}</h4>{students.filter(user => (user.metadata?.group || 'Sem grupo') === group).map(user => <button className="block w-full border-t p-2 text-left text-sm" key={user.uid} onClick={() => onOpen(user)}>{user.name}</button>)}</article>)}
  </section>;
}
