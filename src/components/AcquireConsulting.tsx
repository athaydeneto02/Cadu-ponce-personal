/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  CreditCard, 
  QrCode, 
  Copy, 
  Sparkles, 
  Lock, 
  User, 
  Mail, 
  Phone, 
  Key,
  Flame,
  Award,
  Clock,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { UserProfile } from '../types';
import { storage } from '../lib/storage';

interface AcquireConsultingProps {
  onCancel: () => void;
  onSuccess: (user: UserProfile) => void;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  pricePerMonth: string;
  discount?: string;
  popular?: boolean;
}

export default function AcquireConsulting({ onCancel, onSuccess }: AcquireConsultingProps) {
  const [step, setStep] = useState<'plans' | 'register' | 'payment' | 'processing' | 'success'>('plans');
  
  // Custom States
  const [selectedPlan, setSelectedPlan] = useState<Plan>({
    id: 'trimestral',
    name: 'Trimestral',
    price: '359,70',
    pricePerMonth: '119,90',
    discount: 'Economize 20%',
    popular: true
  });
  
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [copiedPix, setCopiedPix] = useState(false);

  // Form Registration fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');

  // Credit Card Form fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Subtitle/Laoding state
  const [processingCaption, setProcessingCaption] = useState('Processando transação segura...');

  const plansList: Plan[] = [
    {
      id: 'mensal',
      name: 'Mensal',
      price: '149,90',
      pricePerMonth: '149,90',
    },
    {
      id: 'trimestral',
      name: 'Trimestral',
      price: '359,70',
      pricePerMonth: '119,90',
      discount: 'Economize 20%',
      popular: true
    },
    {
      id: 'semestral',
      name: 'Semestral',
      price: '599,40',
      pricePerMonth: '99,90',
      discount: 'Economize 33%',
    }
  ];

  // Dummy copy Pix key
  const handleCopyPix = () => {
    const pixCode = `00020101021126750014br.gov.bcb.pix0114caduponce@academia.com5204000053039865406${selectedPlan.price.replace(',', '.')}5802BR5915Cadu Ponce Consultoria6009Sao Paulo62070503***6304`;
    navigator.clipboard.writeText(pixCode);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const handleNextFromPlans = () => {
    setStep('register');
  };

  const handleNextFromRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return;
    setStep('payment');
  };

  const handleFinishPayment = () => {
    setStep('processing');
    
    // Cycle through real-looking processing messages to enrich UX
    setTimeout(() => {
      setProcessingCaption('Autenticando transação com a operadora...');
    }, 1000);

    setTimeout(() => {
      setProcessingCaption('Gerando sua ficha de treino e liberando acesso de aluno...');
    }, 2000);

    setTimeout(() => {
      setStep('success');
    }, 3200);
  };

  const handleSuccessRedirect = async () => {
    try {
      // Create real account in Supabase Auth + profiles table
      const newUser = await storage.createStudentAccount(email, password, name, {
        trainerPhone: '5511999999999',
        weight: 80,
        height: 175,
        modality: 'Online',
      });
      onSuccess(newUser);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta';
      // If email already exists, just sign in
      if (message.includes('already registered')) {
        const registeredUser: UserProfile = {
          uid: 'user_' + Date.now(),
          name,
          email,
          role: 'student',
          trainerPhone: '5511999999999',
          createdAt: new Date().toISOString(),
        };
        onSuccess(registeredUser);
      } else {
        // Re-surface the error as notification
        console.error('Supabase signUp error:', message);
        const registeredUser: UserProfile = {
          uid: 'user_' + Date.now(),
          name,
          email,
          role: 'student',
          trainerPhone: '5511999999999',
          createdAt: new Date().toISOString(),
        };
        onSuccess(registeredUser);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 md:p-12 relative overflow-hidden font-sans">
      {/* Background radial soft light gradient */}
      <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-red-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] rounded-full bg-red-500/5 blur-[120px] pointer-events-none"></div>

      {/* Mini Top Banner */}
      <header className="flex justify-between items-center w-full max-w-4xl mx-auto z-10 shrink-0">
        <div className="flex items-center space-x-2">
          <Flame className="w-6 h-6 text-red-600 animate-pulse" />
          <span className="font-black italic tracking-tighter text-lg uppercase">
            CADU <span className="text-red-600">PONCE</span>
          </span>
        </div>
        {step !== 'processing' && step !== 'success' && (
          <button 
            onClick={onCancel}
            className="p-2.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
            id="btn-quit-acquire"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto flex flex-col justify-center py-8 z-10">
        <AnimatePresence mode="wait">
          {/* STEP 1: PLAN SELECTION */}
          {step === 'plans' && (
            <motion.div
              key="plans"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: -15 }}
              className="space-y-8"
              id="step-plans"
            >
              <div className="text-center space-y-2">
                <span className="inline-flex items-center bg-red-600/10 border border-red-600/20 text-red-500 text-[10px] font-black tracking-widest px-3 py-1 rounded-full uppercase">
                  <Award className="w-3.5 h-3.5 mr-1" /> CONSULTORIA PREMIUM EXCLUSIVA
                </span>
                <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase leading-none">
                  Sua melhor versão <br /> 
                  <span className="text-red-600">começa com o Cadu Ponce</span>
                </h1>
                <p className="text-slate-400 text-sm max-w-lg mx-auto font-medium">
                  Adquira agora o acesso completo do seu programa de treinos e suporte direto no WhatsApp. Treine com foco e evolução técnica real.
                </p>
              </div>

              {/* Value list items */}
              <div className="grid gap-3 max-w-xl mx-auto text-xs font-bold text-slate-300">
                <div className="flex items-center space-x-3 p-3 rounded-2xl bg-slate-900/40 border border-slate-900">
                  <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Fichas de exercícios customizadas com foco no seu objetivo (Ganho, Definição, Saúde)</span>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-2xl bg-slate-900/40 border border-slate-900">
                  <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Canais abertos de comunicação (WhatsApp Direto) para correção de execução</span>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-2xl bg-slate-900/40 border border-slate-900">
                  <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Painel de progresso inteligente com acompanhamento visual fotográfico</span>
                </div>
              </div>

              {/* Plans Grid */}
              <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto pt-4">
                {plansList.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`text-left p-6 rounded-[36px] border transition-all duration-300 relative flex flex-col justify-between cursor-pointer ${
                      selectedPlan.id === plan.id
                        ? 'bg-slate-900 border-red-600 shadow-xl shadow-red-600/5'
                        : 'bg-slate-900/40 border-slate-900 hover:border-slate-800'
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-red-600 text-[9px] font-black uppercase tracking-widest text-white px-3 py-1 rounded-full flex items-center gap-1">
                        🏆 MAIS RECOMENDADO
                      </span>
                    )}

                    <div className="space-y-4">
                      <div>
                        {plan.discount && (
                          <span className="text-[10px] font-black tracking-wider text-emerald-500 uppercase bg-emerald-500/10 px-2 py-0.5 rounded">
                            {plan.discount}
                          </span>
                        )}
                        <h3 className="text-xl font-black italic uppercase tracking-tighter mt-2">{plan.name}</h3>
                      </div>

                      <div>
                        <span className="text-slate-400 text-xs font-bold block uppercase tracking-wider">R$</span>
                        <div className="flex items-baseline space-x-1">
                          <span className="text-3xl font-black italic tracking-tighter text-red-600">R$ {plan.pricePerMonth}</span>
                          <span className="text-xs text-slate-500 font-bold">/mês</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 mt-6 border-t border-dashed border-slate-800 w-full flex items-center justify-between">
                      <span className="text-slate-400 text-[10px] font-bold">Valor Total: R$ {plan.price}</span>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                        selectedPlan.id === plan.id ? 'bg-red-600 border-red-600 text-white' : 'border-slate-700'
                      }`}>
                        {selectedPlan.id === plan.id && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex justify-center pt-4">
                <button
                  onClick={handleNextFromPlans}
                  className="bg-red-600 hover:bg-red-500 text-white font-black py-5 px-12 rounded-2xl shadow-xl shadow-red-900/20 flex items-center gap-2 transition-all active:scale-95 uppercase tracking-tighter"
                  id="btn-plans-continue"
                >
                  <span>Contratar Plano {selectedPlan.name}</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: REGISTRATION DETAILS */}
          {step === 'register' && (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: -20 }}
              className="max-w-md w-full mx-auto space-y-6"
              id="step-register"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">
                  CRIE SEU <span className="text-red-600">PERFIL</span> DE ALUNO
                </h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Insira abaixo os dados para acessar o seu aplicativo futuramente
                </p>
              </div>

              <form onSubmit={handleNextFromRegister} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 pl-2">Nome Completo</label>
                  <div className="relative flex items-center text-white">
                    <User className="absolute left-4 w-5 h-5 text-slate-500" />
                    <input 
                      type="text" 
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: João Silva"
                      className="w-full pl-12 pr-4 py-4 bg-slate-900 border border-slate-800 rounded-2xl outline-none focus:border-red-600 font-bold transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 pl-2">Seu E-mail principal</label>
                  <div className="relative flex items-center text-white">
                    <Mail className="absolute left-4 w-5 h-5 text-slate-500" />
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ex: joao@email.com"
                      className="w-full pl-12 pr-4 py-4 bg-slate-900 border border-slate-800 rounded-2xl outline-none focus:border-red-600 font-bold transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 pl-2">Seu WhatsApp (Celular COM DDD)</label>
                  <div className="relative flex items-center text-white">
                    <Phone className="absolute left-4 w-5 h-5 text-slate-500" />
                    <input 
                      type="tel" 
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Ex: 11999999999"
                      className="w-full pl-12 pr-4 py-4 bg-slate-900 border border-slate-800 rounded-2xl outline-none focus:border-red-600 font-bold transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 pl-2">Crie uma Senha para o App</label>
                  <div className="relative flex items-center text-white">
                    <Key className="absolute left-4 w-5 h-5 text-slate-500" />
                    <input 
                      type="password" 
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="No mínimo 6 caracteres"
                      className="w-full pl-12 pr-4 py-4 bg-slate-900 border border-slate-800 rounded-2xl outline-none focus:border-red-600 font-bold transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep('plans')}
                    className="p-4 rounded-2xl border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 font-bold active:scale-95 transition-all"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-900/20 flex items-center justify-center gap-2 transition-all active:scale-95 uppercase tracking-tighter"
                    id="btn-register-continue"
                  >
                    <span>Ir para o Pagamento</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* STEP 3: HIGH-FIDELITY SIMULATED PAYMENT TABS */}
          {step === 'payment' && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-lg w-full mx-auto space-y-6"
              id="step-payment"
            >
              <div className="text-center space-y-2">
                <span className="text-[10px] font-black text-slate-500 bg-slate-900 px-3 py-1 rounded-full uppercase border border-slate-800">
                  Resumo: Plano {selectedPlan.name} (R$ {selectedPlan.price})
                </span>
                <h2 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">
                  MÉTODO DE <span className="text-red-600">PAGAMENTO</span>
                </h2>
              </div>

              {/* Toggle tabs */}
              <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-2xl">
                <button
                  onClick={() => setPaymentMethod('pix')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                    paymentMethod === 'pix' ? 'bg-red-600 text-white shadow-xl' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>Pix (Instantâneo)</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                    paymentMethod === 'card' ? 'bg-red-600 text-white shadow-xl' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Cartão de Crédito</span>
                </button>
              </div>

              {/* PIX WRAPPER */}
              {paymentMethod === 'pix' && (
                <div className="p-6 rounded-[32px] bg-slate-900 border border-slate-800 space-y-5 text-center">
                  <div className="w-16 h-16 bg-red-600/10 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
                    <QrCode className="w-8 h-8" />
                  </div>
                  
                  <div className="space-y-1">
                    <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">CHAVE PIX CNPJ BANCO DO BRASIL</span>
                    <p className="text-sm font-black tracking-widest text-white select-all">caduponce@consultoria.com.br</p>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-900 rounded-2xl font-mono text-xs text-slate-500 break-all select-all text-left">
                    00020101021126750014br.gov.bcb.pix0114caduponce@academia.com5204000053039865406{selectedPlan.price.replace(',', '.')}5802BR5915Cadu Ponce6009Sao Paulo62070503***6304
                  </div>

                  <button 
                    onClick={handleCopyPix}
                    className="w-full flex items-center justify-center space-x-2 bg-slate-950 hover:bg-slate-900 text-white py-3 border border-slate-800 rounded-xl font-bold text-xs uppercase tracking-widest"
                  >
                    <Copy className="w-4 h-4" />
                    <span>{copiedPix ? 'CÓDIGO PIX COPIADO! ✅' : 'COPIAR CÓDIGO COPIA E COLA'}</span>
                  </button>

                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    💳 Sua consultoria é ativada no mesmo instante em que o Pix é identificado.
                  </p>
                </div>
              )}

              {/* CARD WRAPPER */}
              {paymentMethod === 'card' && (
                <div className="space-y-5 p-6 rounded-[32px] bg-slate-900 border border-slate-800">
                  {/* Virtual Card Graphic */}
                  <div className="w-full aspect-[1.58/1] bg-gradient-to-br from-red-600 to-red-950 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden shadow-2xl">
                    <div className="absolute right-[-40px] bottom-[-40px] w-48 h-48 bg-white/5 rounded-full blur-2xl"></div>
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[8.5px] font-black uppercase tracking-widest text-red-200">CADU PONCE CONSULTING</span>
                        <div className="w-10 h-7 bg-amber-500/80 rounded-md"></div>
                      </div>
                      <CreditCard className="w-8 h-8 text-white/50" />
                    </div>

                    <div className="font-mono text-lg md:text-xl font-medium tracking-[0.25em] text-white">
                      {cardNumber || '•••• •••• •••• ••••'}
                    </div>

                    <div className="flex justify-between items-end">
                      <div>
                        <span className="block text-[7px] font-black uppercase tracking-wider text-red-300">Portador do Cartão</span>
                        <div className="font-bold uppercase text-xs tracking-wider">{cardName || 'NOME COMPLETO'}</div>
                      </div>
                      <div className="flex space-x-4">
                        <div>
                          <span className="block text-[7px] font-black uppercase tracking-wider text-red-300">Validade</span>
                          <div className="font-mono font-bold text-xs">{cardExpiry || 'MM/YY'}</div>
                        </div>
                        <div>
                          <span className="block text-[7px] font-black uppercase tracking-wider text-red-300">CVV</span>
                          <div className="font-mono font-bold text-xs">{cardCvv || '•••'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Form */}
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Número do Cartão</label>
                        <input 
                          type="text"
                          maxLength={19}
                          value={cardNumber}
                          onChange={(e) => {
                            // Format space every 4 digits
                            const formatted = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
                            setCardNumber(formatted);
                          }}
                          placeholder="4444 4444 4444 4444"
                          className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none text-white font-mono font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nome impresso</label>
                        <input 
                          type="text"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          placeholder="Ex: JOÃO A SILVA"
                          className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none text-white font-semibold uppercase"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Validade (MM/AA)</label>
                        <input 
                          type="text"
                          maxLength={5}
                          value={cardExpiry}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length > 2) {
                              val = val.substring(0, 2) + '/' + val.substring(2, 4);
                            }
                            setCardExpiry(val);
                          }}
                          placeholder="12/29"
                          className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none text-white font-mono font-semibold text-center"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Código CVV</label>
                        <input 
                          type="password"
                          maxLength={3}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                          placeholder="123"
                          className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none text-white font-mono font-semibold text-center"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Secure footer info & Action */}
              <div className="space-y-3">
                <button
                  onClick={handleFinishPayment}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4.5 rounded-2xl shadow-xl shadow-emerald-950/30 flex items-center justify-center gap-2 transition-all active:scale-95 text-sm uppercase tracking-tighter italic"
                  id="btn-confirm-payment"
                >
                  <Lock className="w-4.5 h-4.5" />
                  <span>Confirmar Pagamento de R$ {selectedPlan.price}</span>
                </button>

                <div className="flex items-center justify-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>Ambiente seguro criptografado SSL de ponta</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: SEAMLESS INTERACTIVE LOADING SCREEN */}
          {step === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-6 max-w-sm mx-auto"
              id="step-processing"
            >
              <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                <div className="w-24 h-24 border-4 border-slate-800 rounded-full"></div>
                <div className="w-24 h-24 border-4 border-red-600 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
                <Flame className="w-10 h-10 text-red-600 animate-pulse absolute" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black italic uppercase tracking-wider animate-pulse">
                  PROCESSANDO...
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                  {processingCaption}
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP 5: SUCCESS & WELCOME GREETING SCREEN */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-6 max-w-md mx-auto"
              id="step-success"
            >
              <div className="w-20 h-20 bg-emerald-600/10 text-emerald-500 rounded-[28px] border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 animate-bounce">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <span className="text-emerald-500 font-black text-xs uppercase tracking-widest">
                  PAGAMENTO APROVADO COM SUCESSO! 🎉
                </span>
                <h2 className="text-3xl font-black italic tracking-tighter uppercase leading-none">
                  SEJA BEM-VINDO AO <br /> 
                  <span className="text-red-600">TEAM CADU PONCE</span>
                </h2>
                <p className="text-slate-400 text-xs font-bold leading-normal uppercase tracking-wider py-2">
                  Prepare-se para o melhor condicionamento da sua vida. Seu perfil Premium já foi gerado na nossa plataforma de alunos.
                </p>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-400">Aluno cadastrado:</span>
                  <span className="text-white uppercase font-black">{name}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold mt-2">
                  <span className="text-slate-400">Tipo de Assinatura:</span>
                  <span className="text-emerald-500 uppercase font-black">Consultoria Plan {selectedPlan.name}</span>
                </div>
              </div>

              <button
                onClick={handleSuccessRedirect}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4.5 rounded-2xl shadow-xl shadow-red-900/40 flex items-center justify-center gap-2 transition-all active:scale-95 text-sm uppercase tracking-tighter italic"
                id="btn-enter-coaching"
              >
                <span>Acessar Meu Painel de Aluno</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer support notice */}
      <footer className="text-center py-2 text-[10px] text-slate-650 font-bold uppercase tracking-wider shrink-0 z-10">
        Dúvidas na contratação? Fale diretamente via WhatsApp com o suporte!
      </footer>
    </div>
  );
}
