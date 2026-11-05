import { motion } from 'motion/react';
import { ArrowUpRight, Flame, Instagram, MessageCircle, X } from 'lucide-react';
import { getTrainerWhatsAppUrl, TRAINER_CONFIG } from '../lib/trainerConfig';

interface AcquireConsultingProps {
  onCancel: () => void;
}

export default function AcquireConsulting({ onCancel }: AcquireConsultingProps) {
  const contactUrl = getTrainerWhatsAppUrl('Olá Cadu! Tenho interesse na consultoria e gostaria de conversar sobre os planos disponíveis.');
  const contactPhone = TRAINER_CONFIG.phone.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '+$1 ($2) $3-$4');

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col p-6 md:p-12 relative overflow-hidden font-sans">
      <div aria-hidden="true" className="absolute -top-24 -right-24 w-80 h-80 bg-red-600/10 blur-3xl rounded-full pointer-events-none" />
      <header className="flex justify-between items-center w-full max-w-4xl mx-auto relative">
        <div className="flex items-center gap-2 font-black italic tracking-tighter text-lg">
          <Flame aria-hidden="true" className="w-6 h-6 text-red-600" />
          <span>CADU <span className="text-red-600">PONCE</span></span>
        </div>
        <button type="button" onClick={onCancel} aria-label="Voltar ao login" id="btn-quit-acquire" className="p-2.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
          <X aria-hidden="true" className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto flex flex-col justify-center py-12 relative">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-8" id="step-contact">
          <div className="text-center space-y-4">
            <p className="text-red-400 text-xs font-bold tracking-widest uppercase">{TRAINER_CONFIG.name} · {TRAINER_CONFIG.role}</p>
            <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase leading-tight">Fale diretamente<br /><span className="text-red-500">com o personal</span></h1>
            <p className="text-slate-300 text-sm md:text-base max-w-md mx-auto">Entre em contato para conhecer os planos, tirar suas dúvidas e combinar sua consultoria com o Cadu.</p>
          </div>

          <nav aria-label="Redes sociais e contato do personal" className="space-y-4">
            <a href={contactUrl} target="_blank" rel="noopener noreferrer" id="btn-contact-whatsapp" className="flex items-center gap-4 rounded-2xl bg-red-600 hover:bg-red-500 p-5 md:p-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950">
              <span className="p-3 rounded-xl bg-white/10"><MessageCircle aria-hidden="true" className="w-6 h-6" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-lg font-bold">Conversar no WhatsApp</span>
                <span className="block mt-1 text-sm text-red-100">{contactPhone}</span>
              </span>
              <ArrowUpRight aria-hidden="true" className="w-5 h-5 shrink-0" />
            </a>

            <a href={TRAINER_CONFIG.instagramUrl} target="_blank" rel="noopener noreferrer" id="btn-contact-instagram" className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 hover:border-slate-600 hover:bg-slate-800 p-5 md:p-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950">
              <span className="p-3 rounded-xl bg-slate-800"><Instagram aria-hidden="true" className="w-6 h-6 text-red-400" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-lg font-bold">Instagram</span>
                <span className="block mt-1 text-sm text-slate-300 break-words">@{TRAINER_CONFIG.instagramHandle}</span>
              </span>
              <ArrowUpRight aria-hidden="true" className="w-5 h-5 shrink-0" />
            </a>
          </nav>
        </motion.div>
      </main>
    </div>
  );
}
