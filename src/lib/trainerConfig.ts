/**
 * trainerConfig.ts
 * Configurações centralizadas do Personal Trainer (Cadu Ponce).
 * Altere aqui para atualizar em todo o aplicativo (WhatsApp, Instagram, etc).
 */

export const TRAINER_CONFIG = {
  name: 'Cadu Ponce',
  role: 'Personal Trainer',
  // Telefone para contato com DDD (apenas números, iniciando com 55)
  // Exemplo: '5511999999999'
  phone: '5511999999999',
  // Instagram oficial do personal
  instagramHandle: 'caduponce.personal',
  instagramUrl: 'https://instagram.com/caduponce.personal',
  
  // Mensagem padrão para novos contatos via WhatsApp
  defaultWhatsAppMessage: 'Olá Cadu! Sou seu aluno e gostaria de tirar uma dúvida sobre o meu treino.',
};

/** Retorna o link direto do WhatsApp com mensagem opcional */
export function getTrainerWhatsAppUrl(customMessage?: string, phoneOverride?: string): string {
  const phone = (phoneOverride || TRAINER_CONFIG.phone).replace(/\D/g, '');
  const msg = encodeURIComponent(customMessage || TRAINER_CONFIG.defaultWhatsAppMessage);
  return `https://wa.me/${phone}?text=${msg}`;
}
