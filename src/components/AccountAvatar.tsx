import React from 'react';
import { User } from 'lucide-react';
import { useMediaUrl } from '../lib/mediaDb';

export default function AccountAvatar({ reference, name }: { reference?: string; name: string }) {
  const url = useMediaUrl(reference);
  return url ? <img src={url} alt={`Foto de ${name}`} className="w-full h-full object-cover" /> : <User className="w-12 h-12 text-slate-300" aria-hidden="true" />;
}
