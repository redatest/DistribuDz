import type { LeadStatus, StoreType } from '../types';

export const STORE_TYPE_LABELS: Record<StoreType, string> = {
  superette: 'Superette',
  mini_market: 'Mini Market',
  magasin_gros: 'Magasin de gros',
  hypermarche: 'Hypermarché',
  epicerie: 'Grocery Store / Épicerie',
  autre: 'Autre point de vente',
};

export const STORE_TYPE_COLORS: Record<StoreType, string> = {
  superette: '#047857',
  mini_market: '#0D9488',
  magasin_gros: '#D97706',
  hypermarche: '#0369A1',
  epicerie: '#475569',
  autre: '#64748B',
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  interesse: 'Intéressé',
  contacte: 'Contacté',
  client: 'Client actif',
  non_interesse: 'Non intéressé',
};

export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  interesse: 'text-amber-700 bg-amber-50 border-amber-200',
  contacte: 'text-sky-700 bg-sky-50 border-sky-200',
  client: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  non_interesse: 'text-slate-600 bg-slate-100 border-slate-200',
};
