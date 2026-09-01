import React, { useState } from 'react';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UpdatePasswordFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function UpdatePasswordForm({ onClose, onSuccess }: UpdatePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A nova senha e a confirmação não conferem.');
      return;
    }

    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      // Supabase auth.updateUser updates the password for the currently logged-in user.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw updateError;
      }

      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError('Erro ao atualizar a senha. Verifique se a senha atual está correta e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#1c2b3e]">
      {/* Header Section */}
      <div className="pt-6 px-4 pb-8 shrink-0">
        <button 
          onClick={onClose} 
          className="flex items-center text-white/80 text-sm font-medium hover:text-white transition mb-6"
        >
          <ChevronLeft className="w-5 h-5 -ml-1" /> Voltar
        </button>
        <h1 className="text-white text-[22px] font-normal">Atualizar senha</h1>
      </div>

      {/* Form Container */}
      <div className="bg-white flex-1 rounded-t-xl px-4 pt-6 pb-20 shadow-[0_-8px_20px_rgba(0,0,0,0.1)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
          
          {/* Senha atual */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-bold text-slate-800">Senha atual</label>
            <div className="relative flex items-center">
              <input 
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-[15px] text-slate-700 outline-none focus:border-[#56a8e9] transition-colors"
                placeholder="Digite a senha atual"
              />
              <button 
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="pt-1">
              <button type="button" className="text-[#3b82f6] text-sm font-medium hover:underline">
                Esqueceu sua senha?
              </button>
            </div>
          </div>

          <div className="h-2"></div>

          {/* Nova senha */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-bold text-slate-800">Nova senha</label>
            <div className="relative flex items-center">
              <input 
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-[15px] text-slate-700 outline-none focus:border-[#56a8e9] transition-colors"
                placeholder="Digite a nova senha"
              />
              <button 
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Confirmar nova senha */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-bold text-slate-800">Confirmar nova senha</label>
            <div className="relative flex items-center">
              <input 
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-[15px] text-slate-700 outline-none focus:border-[#56a8e9] transition-colors"
                placeholder="Digite a nova senha outra vez"
              />
              <button 
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm font-medium pt-2">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#56a8e9] hover:bg-[#4597d8] text-white font-medium py-3 rounded-lg mt-8 active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>

        </form>
      </div>
    </div>
  );
}
