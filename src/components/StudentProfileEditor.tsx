import React, { useRef, useState } from 'react';
import type { UserProfile } from '../types';
import { storage } from '../lib/storage';
import { normalizeStudentPhone } from '../lib/studentContact';

export default function StudentProfileEditor({ student, onSaved, onCancel }: {
  student: UserProfile; onSaved: (value: UserProfile) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState(() => ({ name: student.name, phone: student.metadata?.phone || '',
    birthDate: student.metadata?.birthDate || '', group: student.metadata?.group || '',
    gender: student.metadata?.gender || '', modality: student.modality || 'Online' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const change = (field: string, value: string) => setForm(previous => ({ ...previous, [field]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!form.name.trim()) throw new Error('Informe o nome do aluno.');
      const updated: UserProfile = { ...student, name: form.name.trim(), modality: form.modality as UserProfile['modality'],
        metadata: { ...student.metadata, phone: normalizeStudentPhone(form.phone), birthDate: form.birthDate,
          group: form.group.trim(), gender: form.gender } };
      await storage.updateProfile(updated);
      onSaved(updated);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar o aluno.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <form onSubmit={save} className="space-y-4 bg-white text-slate-900 rounded-xl p-5">
    <h3 className="font-bold text-lg">Informações do aluno</h3>
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
      <label className="block text-sm">Nome<input required maxLength={120} value={form.name} onChange={e => change('name', e.target.value)} className="w-full border rounded p-2" /></label>
      <label className="block text-sm">E-mail de acesso<input value={student.email} readOnly className="w-full border rounded p-2 bg-slate-100" /></label>
      <p className="text-xs text-slate-500">O e-mail de acesso precisa de confirmação e não é alterado pela ficha cadastral.</p>
      <label className="block text-sm">WhatsApp do aluno<input type="tel" value={form.phone} onChange={e => change('phone', e.target.value)} placeholder="55 + DDD + número" className="w-full border rounded p-2" /></label>
      <label className="block text-sm">Nascimento<input type="date" value={form.birthDate} onChange={e => change('birthDate', e.target.value)} className="w-full border rounded p-2" /></label>
      <label className="block text-sm">Grupo<input maxLength={120} value={form.group} onChange={e => change('group', e.target.value)} className="w-full border rounded p-2" /></label>
      <label className="block text-sm">Gênero<input maxLength={80} value={form.gender} onChange={e => change('gender', e.target.value)} className="w-full border rounded p-2" /></label>
      <label className="block text-sm">Modalidade<select value={form.modality} onChange={e => change('modality', e.target.value)} className="w-full border rounded p-2"><option>Online</option><option>Presencial</option></select></label>
      <div className="flex gap-3"><button type="submit" className="bg-blue-600 text-white rounded px-4 py-2">{busy ? 'Salvando…' : 'Salvar alterações'}</button><button type="button" onClick={onCancel}>Cancelar</button></div>
    </fieldset>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
  </form>;
}
