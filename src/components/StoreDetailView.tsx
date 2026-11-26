import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Edit3,
  ExternalLink,
  MapPin,
  Phone,
  Save,
  Star,
  Store as StoreIcon,
  Trash2,
  Users,
  Ruler,
  Package,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { LEAD_STATUS_LABELS, STORE_TYPE_LABELS } from '../lib/labels';
import type { LeadHistoryEntry, LeadStatus, Store, StoreType, User, Wilaya } from '../types';
import { StoreMap } from './StoreMap';

interface StoreDetailViewProps {
  storeId: number;
  user: User;
  onBack: () => void;
  onDeleted: () => void;
}

export const StoreDetailView: React.FC<StoreDetailViewProps> = ({
  storeId,
  user,
  onBack,
  onDeleted,
}) => {
  const [store, setStore] = useState<Store | null>(null);
  const [history, setHistory] = useState<LeadHistoryEntry[]>([]);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('interesse');
  const [leadNotes, setLeadNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingLead, setSavingLead] = useState(false);
  const [leadSavedMsg, setLeadSavedMsg] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  // Admin Edit & Delete state
  const [editing, setEditing] = useState(false);
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [editForm, setEditForm] = useState({
    name: '',
    wilaya_id: 0,
    store_type: 'superette' as StoreType,
    address: '',
    phone: '',
    latitude: '',
    longitude: '',
    rating: '',
    opening_hours: '',
    main_products: '',
    approx_surface_m2: '',
    clientele_type: '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiFetch<{
        store: Store;
        lead: { status: LeadStatus; notes: string | null } | null;
        history: LeadHistoryEntry[];
      }>(`/api/stores/${storeId}`),
      apiFetch<{ wilayas: Wilaya[] }>('/api/wilayas'),
    ])
      .then(([detailRes, wilayaRes]) => {
        if (!active) return;
        const s = detailRes.store;
        setStore(s);
        setHistory(detailRes.history || []);
        if (detailRes.lead) {
          setLeadStatus(detailRes.lead.status);
          setLeadNotes(detailRes.lead.notes || '');
        }
        setWilayas(wilayaRes.wilayas);
        setEditForm({
          name: s.name,
          wilaya_id: s.wilaya_id,
          store_type: s.store_type,
          address: s.address || '',
          phone: s.phone || '',
          latitude: String(s.latitude),
          longitude: String(s.longitude),
          rating: s.rating !== null ? String(s.rating) : '',
          opening_hours: s.opening_hours || '',
          main_products: s.main_products || '',
          approx_surface_m2: s.approx_surface_m2 !== null ? String(s.approx_surface_m2) : '',
          clientele_type: s.clientele_type || '',
        });
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
  }, [storeId]);

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLead(true);
    setLeadSavedMsg(null);
    try {
      const res = await apiFetch<{ history: LeadHistoryEntry[] }>(`/api/stores/${storeId}/lead`, {
        method: 'PUT',
        body: JSON.stringify({
          status: leadStatus,
          notes: leadNotes,
        }),
      });
      setHistory(res.history || []);
      setLeadSavedMsg('Suivi commercial enregistré.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setSavingLead(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ store: Store }>(`/api/stores/${storeId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...editForm,
          latitude: Number(editForm.latitude),
          longitude: Number(editForm.longitude),
          rating: editForm.rating ? Number(editForm.rating) : null,
          approx_surface_m2: editForm.approx_surface_m2
            ? Number(editForm.approx_surface_m2)
            : null,
        }),
      });
      setStore(res.store);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour.');
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/api/stores/${storeId}`, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  if (loading) {
    return <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  if (!store) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-red-700">
        {error || 'Magasin introuvable.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour</span>
        </button>

        {user.role === 'admin' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{editing ? 'Annuler modification' : 'Modifier la fiche'}</span>
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Confirmer la suppression
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {editing ? (
        <form
          onSubmit={handleSaveEdit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="font-display text-base font-bold text-slate-900">
            Modifier les informations du magasin
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nom</label>
              <input
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Wilaya</label>
              <select
                value={editForm.wilaya_id}
                onChange={(e) => setEditForm({ ...editForm, wilaya_id: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {wilayas.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Format</label>
              <select
                value={editForm.store_type}
                onChange={(e) => setEditForm({ ...editForm, store_type: e.target.value as StoreType })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(
                  ['superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche', 'autre'] as StoreType[]
                ).map((t) => (
                  <option key={t} value={t}>
                    {STORE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Adresse</label>
              <input
                type="text"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Horaires</label>
              <input
                type="text"
                value={editForm.opening_hours}
                onChange={(e) => setEditForm({ ...editForm, opening_hours: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Surface approx. (m²)
              </label>
              <input
                type="number"
                value={editForm.approx_surface_m2}
                onChange={(e) => setEditForm({ ...editForm, approx_surface_m2: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Produits principaux vendus
              </label>
              <input
                type="text"
                value={editForm.main_products}
                onChange={(e) => setEditForm({ ...editForm, main_products: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Type de clientèle
              </label>
              <input
                type="text"
                value={editForm.clientele_type}
                onChange={(e) => setEditForm({ ...editForm, clientele_type: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Enregistrer les modifications
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Enriched Store Profile & Map */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-5">
                <div className="md:col-span-2 bg-slate-100 min-h-[220px] relative">
                  {store.photo_url && !imgError ? (
                    <img
                      src={store.photo_url}
                      alt={store.name}
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-100 text-slate-400">
                      <StoreIcon className="w-10 h-10 mb-2" />
                      <span className="text-xs text-center">{store.name}</span>
                    </div>
                  )}
                </div>

                <div className="md:col-span-3 p-6 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                      <span>{STORE_TYPE_LABELS[store.store_type]}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Wilaya {store.wilaya_code} — {store.wilaya_name}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-700">{store.commune}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular text-emerald-700 font-medium">
                        Qualité {store.quality_score}%
                      </span>
                    </div>

                    <h2 className="mt-1.5 font-display text-xl font-bold text-slate-900">
                      {store.name}
                    </h2>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1 font-mono-tabular">
                        <Star className="w-3.5 h-3.5 text-amber-500" />
                        <strong className="text-slate-900">
                          {store.rating !== null ? store.rating.toFixed(1) : 'N/A'}
                        </strong>
                        <span>({store.review_count} avis Google)</span>
                      </span>
                      {store.google_maps_url && (
                        <a
                          href={store.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:underline flex items-center gap-1 font-medium"
                        >
                          <span>Ouvrir dans Google Maps</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-slate-400">Adresse</div>
                        <div className="text-slate-800 font-medium">
                          {store.address || 'Non renseignée'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-slate-400">Téléphone</div>
                        <div className="text-slate-800 font-mono-tabular font-medium">
                          {store.phone || 'Non disponible'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-slate-400">Horaires précis</div>
                        <div className="text-slate-800 font-medium">
                          {store.opening_hours || 'Non renseignés'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Ruler className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-slate-400">Surface approximative</div>
                        <div className="text-slate-800 font-mono-tabular font-medium">
                          {store.approx_surface_m2 ? `${store.approx_surface_m2} m²` : 'Non estimée'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enriched B2B Section */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="flex items-start gap-2">
                  <Package className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-slate-700">Produits principaux vendus</div>
                    <div className="text-slate-600 mt-0.5">
                      {store.main_products || 'Alimentation générale'}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-slate-700">Typologie de clientèle</div>
                    <div className="text-slate-600 mt-0.5">
                      {store.clientele_type || 'Consommation locale'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* GPS Map */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Localisation GPS exacte
                </h3>
                <span className="font-mono-tabular text-xs text-slate-500">
                  {store.latitude.toFixed(4)}, {store.longitude.toFixed(4)}
                </span>
              </div>
              <StoreMap stores={[store]} singleStoreMode heightClass="h-[260px]" />
            </div>
          </div>

          {/* Right Column: Lead / CRM Tracking Panel */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Suivi commercial & Lead CRM
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Qualifiez ce point de vente et conservez l’historique de vos échanges.
              </p>

              <form onSubmit={handleSaveLead} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Statut de prospection
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['interesse', 'contacte', 'client', 'non_interesse'] as LeadStatus[]).map(
                      (st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setLeadStatus(st)}
                          className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                            leadStatus === st
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {LEAD_STATUS_LABELS[st]}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Note d’entretien / remarque
                  </label>
                  <textarea
                    rows={3}
                    value={leadNotes}
                    onChange={(e) => setLeadNotes(e.target.value)}
                    placeholder="Ex: Gérant contacté, intéressé par livraison hebdomadaire palettes 1L..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                {leadSavedMsg && (
                  <div className="text-xs text-emerald-700 font-medium">{leadSavedMsg}</div>
                )}

                <button
                  type="submit"
                  disabled={savingLead}
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingLead ? 'Enregistrement...' : 'Enregistrer le suivi'}</span>
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-slate-700 mb-3">
                  Historique des interactions ({history.length})
                </h4>
                {history.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Aucune interaction enregistrée pour ce magasin.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {history.map((h) => (
                      <div key={h.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">
                            {LEAD_STATUS_LABELS[h.status]}
                          </span>
                          <span className="font-mono-tabular text-[11px] text-slate-400">
                            {new Date(h.created_at).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                        {h.note && <p className="mt-1 text-slate-600">{h.note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
