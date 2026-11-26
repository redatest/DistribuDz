import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Phone, Star, Target } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { LEAD_STATUS_LABELS, STORE_TYPE_LABELS } from '../lib/labels';
import type { RecommendationItem, User } from '../types';

interface RecommendationsViewProps {
  user: User;
  onSelectStore: (storeId: number) => void;
  onOpenProfile: () => void;
}

export const RecommendationsView: React.FC<RecommendationsViewProps> = ({
  user,
  onSelectStore,
  onOpenProfile,
}) => {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ recommendations: RecommendationItem[] }>('/api/stores/recommendations')
      .then((res) => {
        if (active) setItems(res.recommendations);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Matching intelligent Producteur & Points de vente
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Classement calculé selon vos territoires ({user.territory_names?.join(', ') || 'Toutes wilayas'}),
            formats ciblés ({user.preferred_store_types.map((t) => STORE_TYPE_LABELS[t]).join(', ')}),
            secteur ({user.sector || 'Général'}) et fiabilité Google Maps.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
        >
          Ajuster mes critères
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-52 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ store, match_score, reasons }) => (
            <div
              key={store.id}
              onClick={() => onSelectStore(store.id)}
              className="bg-white border border-slate-200 hover:border-emerald-600 rounded-xl p-5 cursor-pointer transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">
                      {store.wilaya_name} · {STORE_TYPE_LABELS[store.store_type]}
                    </div>
                    <h3 className="mt-1 font-display text-sm font-bold text-slate-900">
                      {store.name}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-tabular text-lg font-bold text-emerald-700">
                      {match_score}%
                    </div>
                    <div className="text-[11px] text-slate-400">Pertinence</div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {reasons.map((reason) => (
                    <div key={reason} className="flex items-center gap-1.5 text-xs text-slate-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>

                {store.main_products && (
                  <p className="mt-3 text-xs text-slate-500 line-clamp-2">
                    Rayons : {store.main_products}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-slate-600 font-mono-tabular">
                  {store.rating !== null && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-500" />
                      {store.rating.toFixed(1)}
                    </span>
                  )}
                  {store.phone && (
                    <span className="flex items-center gap-1 text-emerald-700">
                      <Phone className="w-3 h-3" />
                      Tél. vérifié
                    </span>
                  )}
                </div>

                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <span>
                    {store.lead_status ? LEAD_STATUS_LABELS[store.lead_status] : 'Prospecter'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Target className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-medium text-slate-900">Aucune recommandation disponible</div>
        </div>
      )}
    </div>
  );
};
