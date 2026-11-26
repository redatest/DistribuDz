import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { ArrowUpRight, MapPin, Star, Store as StoreIcon, CheckCircle2, Briefcase } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { STORE_TYPE_COLORS, STORE_TYPE_LABELS } from '../lib/labels';
import type { StatsResponse, StoreType, User } from '../types';
import { StoreMap } from './StoreMap';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

interface DashboardViewProps {
  user: User;
  onSelectStore: (storeId: number) => void;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  onSelectStore,
  onNavigate,
}) => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<StatsResponse>('/api/stats')
      .then((res) => {
        if (active) setStats(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white border border-slate-200 animate-pulse p-5" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 rounded-xl bg-white border border-slate-200 animate-pulse" />
          <div className="h-80 rounded-xl bg-white border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 bg-white border border-red-200 rounded-xl text-sm text-red-700">
        {error || 'Impossible de charger les statistiques.'}
      </div>
    );
  }

  const barData = {
    labels: stats.by_wilaya.map((w) => `${w.code} ${w.name}`),
    datasets: [
      {
        label: 'Détail & Hypermarchés',
        data: stats.by_wilaya.map((w) => Math.max(0, w.count - w.wholesale_count)),
        backgroundColor: '#047857',
        borderRadius: 4,
      },
      {
        label: 'Magasins de gros',
        data: stats.by_wilaya.map((w) => w.wholesale_count),
        backgroundColor: '#D97706',
        borderRadius: 4,
      },
    ],
  };

  const doughnutData = {
    labels: stats.by_type.map((t) => STORE_TYPE_LABELS[t.store_type as StoreType] || t.store_type),
    datasets: [
      {
        data: stats.by_type.map((t) => t.count),
        backgroundColor: stats.by_type.map(
          (t) => STORE_TYPE_COLORS[t.store_type as StoreType] || '#64748B'
        ),
        borderWidth: 0,
      },
    ],
  };

  const isAdmin = user.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Contextual Hero Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            {isAdmin
              ? 'Pilotage du réseau national & qualité des données'
              : `Espace Producteur — ${user.company_name || user.full_name}`}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isAdmin
              ? `${stats.active_wilayas} wilayas actives sur ${stats.total_wilayas} · Centralisation Google Maps & validation B2B`
              : user.territory_names && user.territory_names.length > 0
                ? `Territoires assignés : ${user.territory_names.join(', ')}`
                : 'Accès complet aux points de vente actifs · Activez votre matching sur mesure'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate(isAdmin ? 'scraping' : 'recommendations')}
            className="px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            {isAdmin ? 'Lancer une collecte Maps' : 'Voir mes recommandations'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('stores')}
            className="px-4 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            Explorer le répertoire
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Points de vente recensés</span>
            <StoreIcon className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-semibold text-slate-900">
            {stats.total_stores}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {stats.total_reviews.toLocaleString('fr-FR')} avis Google cumulés
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Couverture territoriale</span>
            <MapPin className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-semibold text-slate-900">
            {stats.active_wilayas} / {stats.total_wilayas}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Wilayas actives (extension 58 wilayas prête)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Note moyenne Google</span>
            <Star className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-semibold text-slate-900">
            {stats.avg_rating.toFixed(2)} / 5
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Fiabilité moyenne des points de vente
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isAdmin ? 'Qualité globale des fiches' : 'Mes Leads suivis'}</span>
            {isAdmin ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            ) : (
              <Briefcase className="w-4 h-4 text-emerald-700" />
            )}
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-semibold text-slate-900">
            {isAdmin ? `${stats.data_quality.overall_pct}%` : stats.lead_summary.total}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {isAdmin
              ? `${stats.data_quality.phone_pct}% avec téléphone vérifié`
              : `${stats.lead_summary.client} clients · ${stats.lead_summary.contacte} contactés`}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Répartition par Wilaya (Détail vs Gros)
              </h3>
              <p className="text-xs text-slate-500">
                Nombre de points de vente actifs sur chaque wilaya
              </p>
            </div>
          </div>
          <div className="h-64">
            <Bar
              data={barData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                },
                scales: {
                  x: { stacked: true, grid: { display: false } },
                  y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
                },
              }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Formats de distribution
            </h3>
            <p className="text-xs text-slate-500">Ventilation par catégorie de magasin</p>
          </div>
          <div className="flex-1 flex items-center justify-center py-4 min-h-[220px]">
            <Doughnut
              data={doughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '64%',
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Data Quality + Map Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Indicateurs de qualité des données
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Complétude des champs exploitables par les commerciaux
            </p>
          </div>

          {[
            { label: 'Numéro de téléphone joignable', pct: stats.data_quality.phone_pct },
            { label: 'Adresse postale complète', pct: stats.data_quality.address_pct },
            { label: 'Horaires d’ouverture renseignés', pct: stats.data_quality.hours_pct },
            { label: 'Fiches B2B enrichies (surface & rayons)', pct: stats.data_quality.enriched_pct },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-700">{item.label}</span>
                <span className="font-mono-tabular font-semibold text-slate-900">{item.pct}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-700 rounded-full transition-all"
                  style={{ width: `${item.pct}%` }}
                />
              </div>
            </div>
          ))}

          {!isAdmin && (
            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs font-medium text-slate-700 mb-2">Pipeline Commercial</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono-tabular text-base font-semibold text-amber-700">
                    {stats.lead_summary.interesse}
                  </div>
                  <div className="text-[11px] text-slate-500">Intéressés</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono-tabular text-base font-semibold text-sky-700">
                    {stats.lead_summary.contacte}
                  </div>
                  <div className="text-[11px] text-slate-500">Contactés</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono-tabular text-base font-semibold text-emerald-700">
                    {stats.lead_summary.client}
                  </div>
                  <div className="text-[11px] text-slate-500">Clients</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Aperçu cartographique récent
              </h3>
              <p className="text-xs text-slate-500">
                Points de vente les plus récemment ajoutés ou mis à jour
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('map')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 whitespace-nowrap"
            >
              <span>Plein écran</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <StoreMap
            stores={stats.recent_stores}
            onSelectStore={onSelectStore}
            heightClass="h-[260px]"
          />
        </div>
      </div>

      {/* Recent Stores Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Derniers magasins ajoutés
          </h3>
          <button
            type="button"
            onClick={() => onNavigate('stores')}
            className="text-xs font-medium text-emerald-700 hover:underline"
          >
            Voir tout le répertoire
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4">Magasin</th>
                <th className="py-2.5 px-4">Wilaya</th>
                <th className="py-2.5 px-4">Format</th>
                <th className="py-2.5 px-4">Téléphone</th>
                <th className="py-2.5 px-4 text-right">Note</th>
                <th className="py-2.5 px-4 text-right">Qualité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {stats.recent_stores.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => onSelectStore(s.id)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 font-medium text-slate-900">{s.name}</td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {s.wilaya_code} · {s.wilaya_name}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {STORE_TYPE_LABELS[s.store_type]}
                  </td>
                  <td className="py-2.5 px-4 font-mono-tabular text-slate-600">
                    {s.phone || 'Non renseigné'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-900">
                    {s.rating !== null ? `${s.rating.toFixed(1)} ★` : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-tabular text-emerald-700 font-medium">
                    {s.quality_score}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
