/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, X, Check } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLogin: (email: string, password: string) => void | Promise<void>;
  onAcquireClick?: () => void;
}

export default function Login({ onLogin, onAcquireClick }: LoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Password Reset States
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError(null);
    try {
      await onLogin(email, password);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setLoginError(err.message);
      } else {
        setLoginError('Ocorreu um erro ao fazer login.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
  return (
    <div className="min-h-screen bg-[#1B2A4A] flex flex-col justify-center py-12 px-8 relative overflow-x-hidden overflow-y-auto">
      {/* Background decoration */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full mx-auto relative z-10"
      >
        <div className="mb-12 flex flex-col items-center">
          <BrandLogo size="lg" className="flex-col !space-x-0 !space-y-4 mb-2" />
          <p className="text-white/60 text-center mt-4 font-medium">Sua evolução começa aqui</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest pl-4 mb-2 block">
              E-mail ou CPF
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-red-500 transition-colors" />
              </div>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex: joao@email.com"
                className="block w-full pl-12 pr-4 py-4 bg-white border border-transparent rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest pl-4 mb-2 block">
              Senha
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-red-500 transition-colors" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className="block w-full pl-12 pr-12 py-4 bg-white border border-transparent rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 text-slate-400" />
                ) : (
                  <Eye className="h-5 w-5 text-slate-400" />
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button 
              type="button"
              onClick={() => setIsResetOpen(true)}
              className="text-xs text-white/60 hover:text-white font-semibold tracking-wide hover:underline cursor-pointer transition-colors duration-200"
            >
              Esqueci a senha
            </button>
          </div>

          {loginError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-xs font-semibold text-center bg-red-950/50 border border-red-500/30 rounded-xl px-4 py-2"
            >
              {loginError}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-red-900/20 flex items-center justify-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50 mt-4 uppercase tracking-tighter"
          >
            {isSubmitting ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Entrar no App</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-12 text-center">
          <p className="text-white/60 text-xs font-medium">Ainda não é aluno?</p>
          <button 
            type="button"
            onClick={onAcquireClick}
            className="mt-2 text-white font-bold border-b border-white/40 pb-1 hover:text-red-400 hover:border-red-400 transition-colors"
          >
            Adquirir Consultoria Agora
          </button>
        </div>
      </motion.div>

      {/* Elegant Password Reset Modal */}
      <AnimatePresence>
        {isResetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6 animate-none"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-3xl w-full max-w-sm relative shadow-2xl"
            >
              <button
                type="button"
                onClick={() => {
                  setIsResetOpen(false);
                  setResetSuccess(false);
                  setResetEmail('');
                }}
                className="absolute top-4 right-4 text-slate-450 hover:text-white p-1.5 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-red-950/40 text-red-500 rounded-2xl flex items-center justify-center mb-4 border border-red-900/30">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-white">Recuperar Senha</h3>
                <p className="text-slate-400 text-xs mt-2 px-3 leading-relaxed">
                  Digite seu e-mail cadastrado e enviaremos as instruções para você redefinir sua senha.
                </p>
              </div>

              {resetSuccess ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-2xl text-center space-y-2"
                >
                  <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <Check className="w-5 h-5 animate-pulse" />
                  </div>
                  <p className="text-emerald-400 text-xs font-semibold">Link de recuperação enviado!</p>
                  <p className="text-slate-450 text-[11px] leading-relaxed">Verifique a caixa de entrada do e-mail inserido.</p>
                </motion.div>
              ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setIsResetting(true);
                const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                setIsResetting(false);
                if (!error) {
                  setResetSuccess(true);
                  setTimeout(() => {
                    setResetSuccess(false);
                    setIsResetOpen(false);
                    setResetEmail('');
                  }, 3000);
                }
              }} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-2 mb-1 block">
                      Seu E-mail
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-slate-500" />
                      </div>
                      <input
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="Ex: joao@email.com"
                        className="block w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-600/50 focus:border-red-600 transition-all font-medium text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isResetting}
                    className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-900/20 flex items-center justify-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50 text-sm cursor-pointer"
                  >
                    {isResetting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>Enviar Link de Recuperação</span>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
