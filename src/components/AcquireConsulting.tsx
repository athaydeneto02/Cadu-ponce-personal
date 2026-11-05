import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Award, Check, Flame, MessageCircle, X } from 'lucide-react';
import { getTrainerWhatsAppUrl } from '../lib/trainerConfig';

interface AcquireConsultingProps {
  onCancel: () => void;
}

const plans = [
  { id: 'mensal', name: 'Mensal', price: '149,90', monthlyPrice: '149,90', discount: null },
  { id: 'trimestral', name: 'Trimestral', price: '359,70', monthlyPrice: '119,90', discount: 'Economize 20%' },
  { id: 'semestral', name: 'Semestral', price: '599,40', monthlyPrice: '99,90', discount: 'Economize 33%' },
];

export default function AcquireConsulting({ onCancel }: AcquireConsultingProps) {
  const [selectedPlanId, setSelectedPlanId] = useState('trimestral');
  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) ?? plans[1];
  const contactUrl = getTrainerWhatsAppUrl('Olá Cadu! Tenho interesse na consultoria do plano ' + selectedPlan.name + ', no valor total de R$ ' + selectedPlan.price + '. Gostaria de combinar a contratação e o pagamento.');

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col p-6 md:p-12 relative overflow-hidden font-sans">
      <div aria-hidden="true" className="absolute -top-24 -right-24 w-80 h-80 bg-red-600/10 blur-3xl rounded-full" />
      <header className="flex justify-between items-center w-full max-w-4xl mx-auto relative">
        <div className="flex items-center gap-2 font-black italic tracking-tighter text-lg">
          <Flame aria-hidden="true" className="w-6 h-6 text-red-600" />
          <span>CADU <span className="text-red-600">PONCE</span></span>
        </div>
        <button type="button" onClick={onCancel} aria-label="Voltar ao login" id="btn-quit-acquire" className="p-2.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white">
          <X aria-hidden="true" className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto flex flex-col justify-center py-10 relative">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-8" id="step-plans">
          <div className="text-center space-y-3">
            <span className="inline-flex items-center gap-1 bg-red-600/10 border border-red-600/20 text-red-400 text-xs font-bold px-3 py-1 rounded-full uppercase">
              <Award aria-hidden="true" className="w-4 h-4" /> Consultoria esportiva
            </span>
            <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase leading-tight">Sua melhor versão<br /><span className="text-red-500">começa com o Cadu Ponce</span></h1>
            <p className="text-slate-300 text-sm max-w-lg mx-auto">Escolha seu plano e fale diretamente com o personal para combinar seus objetivos, a contratação e o pagamento.</p>
          </div>

          <ul className="grid gap-3 max-w-xl mx-auto text-sm text-slate-200">
            {['Treinos personalizados para seus objetivos', 'Suporte e orientação pelo WhatsApp', 'Histórico de treinos e acompanhamento da evolução'].map(benefit => (
              <li key={benefit} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                <Check aria-hidden="true" className="w-5 h-5 text-emerald-400 shrink-0" />{benefit}
              </li>
            ))}
          </ul>

          <div className="grid gap-4 md:grid-cols-3" role="group" aria-label="Escolha um plano">
            {plans.map(plan => (
              <button key={plan.id} type="button" aria-pressed={plan.id === selectedPlanId} onClick={() => setSelectedPlanId(plan.id)} className={'p-6 rounded-2xl border-2 text-left transition-colors ' + (plan.id === selectedPlanId ? 'border-red-500 bg-red-600/10' : 'border-slate-800 bg-slate-900 hover:border-slate-600')}>
                <h2 className="font-bold uppercase text-lg">{plan.name}</h2>
                <p className="mt-3"><span className="text-3xl font-black">R$ {plan.monthlyPrice}</span><span className="text-slate-300 text-sm"> /mês</span></p>
                <p className="text-sm text-slate-300 mt-2">Valor total: R$ {plan.price}</p>
                {plan.discount && <p className="text-sm text-emerald-400 mt-3 font-semibold">{plan.discount}</p>}
              </button>
            ))}
          </div>

          <div className="max-w-lg mx-auto text-center space-y-3">
            <a href={contactUrl} target="_blank" rel="noopener noreferrer" id="btn-plans-continue" className="w-full bg-red-600 hover:bg-red-500 text-white font-bold p-5 rounded-2xl flex items-center justify-center gap-3">
              <MessageCircle aria-hidden="true" className="w-5 h-5 shrink-0" /> Solicitar plano {selectedPlan.name} pelo WhatsApp <ArrowRight aria-hidden="true" className="w-5 h-5 shrink-0" />
            </a>
            <p className="text-slate-300 text-sm">O pagamento e a liberação do acesso são combinados diretamente pelo WhatsApp.</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
