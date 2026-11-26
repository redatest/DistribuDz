import React, { useEffect, useState } from 'react';
import { Briefcase, ExternalLink, Phone } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { LEAD_STATUS_LABELS, STORE_TYPE_LABELS } from '../lib/labels';
import type { LeadRecord, LeadStatus } from '../types';

interface LeadsViewProps {
  onSelectStore: (storeId: number) => void;
  onExploreStores: () => void;
}

export const LeadsView: React.FC<LeadsViewProps> = ({ onSelectStore, onExploreStores }) => {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [filter, setFilter] = useState<'all' | LeadStatus>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ leads: LeadRecord[] }>('/api/leads')
      .then((res) => {
        if (active) setLeads(res.leads);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = filter === 'all' ? leads : leads.filter((l) => l.status === filter);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'all', label: 'Tous' },
              { id: 'interesse', label: 'Intéressé' },
              { id: 'contacte', label: 'Contacté' },
              { id: 'client', label: 'Client actif' },
              { id: 'non_interesse', label: 'Non intéressé' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === item.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="font-mono-tabular text-xs text-slate-500">
          {filtered.length} point{filtered.length > 1 ? 's' : ''} de vente suivi
          {filtered.length > 1 ? 's' : ''}
        </div>
      </div>

      {loading ? (
        <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-medium text-slate-900">Aucun lead dans cette catégorie</div>
          <p className="text-xs text-slate-500 mt-1">
            Ouvrez la fiche d’un magasin pour le marquer comme « Intéressé », « Contacté » ou « Client ».
          </p>
          <button
            type="button"
            onClick={onExploreStores}
            className="mt-4 px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg"
          >
            Explorer les magasins
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((lead) => (
            <div
              key={lead.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-500">
                      {lead.wilaya_code} · {lead.wilaya_name} · {STORE_TYPE_LABELS[lead.store_type]}
                    </div>
                    <h3 className="mt-1 font-display text-sm font-bold text-slate-900">
                      {lead.store_name}
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                    {LEAD_STATUS_LABELS[lead.status]}
                  </span>
                </div>

                {lead.phone && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-mono-tabular text-slate-700">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{lead.phone}</span>
                  </div>
                )}

                {lead.notes && (
                  <p className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    {lead.notes}
                  </p>
                )}

                {lead.history.length > 0 && (
                  <div className="mt-3 text-[11px] text-slate-400">
                    {lead.history.length} mise{lead.history.length > 1 ? 's' : ''} à jour · Dernier
                    contact le {new Date(lead.updated_at).toLocaleDateString('fr-FR')}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => onSelectStore(lead.store_id)}
                  className="text-xs font-medium text-emerald-700 hover:underline flex items-center gap-1"
                >
                  <span>Ouvrir la fiche & historique</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
