import writeXlsxFile from 'write-excel-file/browser';
import type { Store } from '../types';
import { STORE_TYPE_LABELS, LEAD_STATUS_LABELS } from './labels';

// Jeton conservé uniquement en mémoire JS (jamais dans localStorage/sessionStorage)
let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Erreur serveur (${res.status})`);
  }
  return data as T;
}

function storesToExportRows(stores: Store[]) {
  return stores.map((s) => ({
    ID: s.id,
    Nom: s.name,
    Code_Wilaya: s.wilaya_code,
    Wilaya: s.wilaya_name,
    Ville_Commune: s.commune,
    Type: STORE_TYPE_LABELS[s.store_type] || s.store_type,
    Adresse: s.address || '',
    Telephone: s.phone || '',
    Latitude: s.latitude,
    Longitude: s.longitude,
    Note_Google: s.rating ?? '',
    Nombre_Avis: s.review_count,
    Horaires: s.opening_hours || '',
    Produits_Principaux: s.main_products || '',
    Surface_m2: s.approx_surface_m2 ?? '',
    Clientele: s.clientele_type || '',
    Statut_Lead: s.lead_status ? LEAD_STATUS_LABELS[s.lead_status] : '',
    Lien_Google_Maps: s.google_maps_url || '',
    Score_Qualite: `${s.quality_score}%`,
    Mise_a_jour: s.updated_at,
  }));
}

export function exportStoresCsv(stores: Store[], filename = 'distribdz_magasins.csv'): void {
  const rows = storesToExportRows(stores);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const str = String(val ?? '');
    if (/[",;\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvLines = [
    headers.join(';'),
    ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportStoresExcel(
  stores: Store[],
  filename = 'distribdz_magasins.xlsx'
): Promise<void> {
  const rows = storesToExportRows(stores);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const headerRow = headers.map((h) => ({ value: h, fontWeight: 'bold' as const }));
  const dataRows = rows.map((r) =>
    headers.map((h) => {
      const val = (r as Record<string, unknown>)[h];
      if (typeof val === 'number') return { type: Number, value: val };
      return { type: String, value: String(val ?? '') };
    })
  );
  await writeXlsxFile([headerRow, ...dataRows], {
    sheet: 'Magasins_DistribDZ',
  }).toFile(filename);
}
