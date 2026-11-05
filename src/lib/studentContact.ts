import type { UserProfile } from '../types';

/** Brazilian national numbers receive the country code once; international numbers keep it. */
export function normalizeStudentPhone(value: string): string {
  const phone = value.replace(/\D/g, '');
  if (!phone) return '';
  const normalized = phone.length === 10 || phone.length === 11 ? `55${phone}` : phone;
  if (!/^[1-9]\d{10,14}$/.test(normalized)) throw new Error('Informe um WhatsApp válido com DDD e código do país.');
  return normalized;
}

export function studentWhatsAppUrl(student: Pick<UserProfile, 'metadata'>, message = ''): string | undefined {
  try {
    const phone = normalizeStudentPhone(student.metadata?.phone || '');
    return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : undefined;
  } catch { return undefined; }
}
