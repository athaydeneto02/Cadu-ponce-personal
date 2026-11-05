import { useState, type FormEvent } from 'react';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UpdatePasswordFormProps {
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  recovery?: boolean;
}

export default function UpdatePasswordForm({ onClose, onSuccess, recovery = false }: UpdatePasswordFormProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    if (newPassword.length < 12) {
      setError('Use uma senha com pelo menos 12 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A nova senha e a confirmação não conferem.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !data.user) throw new Error('Sua sessão expirou. Solicite um novo link de recuperação ou entre novamente.');
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setNewPassword('');
      setConfirmPassword('');
      await onSuccess();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível atualizar a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#1c2b3e]">
      <header className="pt-6 px-4 pb-8 shrink-0">
        <button type="button" disabled={loading} onClick={onClose} className="flex items-center text-white/80 text-sm font-medium hover:text-white mb-6 disabled:opacity-50">
          <ChevronLeft aria-hidden="true" className="w-5 h-5" /> {recovery ? 'Voltar ao login' : 'Voltar'}
        </button>
        <h1 className="text-white text-[22px]">{recovery ? 'Redefinir senha' : 'Atualizar senha'}</h1>
      </header>
      <div className="bg-white flex-1 rounded-t-xl px-4 pt-6 pb-20 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto">
          <p className="text-slate-600 text-sm">Escolha uma nova senha com pelo menos 12 caracteres.</p>
          <div className="space-y-2">
            <label htmlFor="new-password" className="text-sm font-bold text-slate-800">Nova senha</label>
            <div className="relative">
              <input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} className="w-full border border-slate-300 rounded-lg pl-3 pr-12 py-3 text-slate-800" />
              <button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-500">
                {showPassword ? <EyeOff aria-hidden="true" className="w-5 h-5" /> : <Eye aria-hidden="true" className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm-password" className="text-sm font-bold text-slate-800">Confirmar nova senha</label>
            <input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-3 text-slate-800" />
          </div>
          {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-[#0070f3] hover:bg-blue-700 text-white font-medium py-3 rounded-lg disabled:opacity-60">
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
