import React, { useEffect, useState } from 'react';
import { Code2, Save, User as UserIcon } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { STORE_TYPE_LABELS } from '../lib/labels';
import type { StoreType, User, Wilaya } from '../types';

interface ProfileAndApiViewProps {
  mode: 'profile' | 'api';
  user: User;
  onUserUpdated: (user: User) => void;
}

export const ProfileAndApiView: React.FC<ProfileAndApiViewProps> = ({
  mode,
  user,
  onUserUpdated,
}) => {
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [fullName, setFullName] = useState(user.full_name);
  const [companyName, setCompanyName] = useState(user.company_name || '');
  const [sector, setSector] = useState(user.sector || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [preferredWilayaId, setPreferredWilayaId] = useState<number | ''>(
    user.preferred_wilaya_id || ''
  );
  const [preferredTypes, setPreferredTypes] = useState<StoreType[]>(user.preferred_store_types);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ wilayas: Wilaya[] }>('/api/wilayas')
      .then((res) => setWilayas(res.wilayas))
      .catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: fullName,
          company_name: companyName,
          sector,
          phone,
          preferred_wilaya_id: preferredWilayaId || null,
          preferred_store_types: preferredTypes,
          current_password: currentPassword || undefined,
          new_password: newPassword || undefined,
        }),
      });
      onUserUpdated(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setMsg('Profil mis à jour avec succès.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'api') {
    const endpoints = [
      { method: 'POST', path: '/api/auth/login', desc: 'Authentification et obtention du jeton Bearer' },
      { method: 'POST', path: '/api/auth/logout', desc: 'Révocation de la session courante' },
      { method: 'GET', path: '/api/wilayas', desc: 'Liste des wilayas actives (?all=1 pour les 58 wilayas)' },
      { method: 'GET', path: '/api/stores', desc: 'Recherche multi-critères (wilaya_id, store_type, min_rating, has_phone, q, lat, lng, radius_km)' },
      { method: 'GET', path: '/api/stores/nearby', desc: 'Géolocalisation mobile (?lat=36.28&lng=7.95&radius_km=30)' },
      { method: 'GET', path: '/api/stores/recommendations', desc: 'Moteur de matching personnalisé par producteur' },
      { method: 'GET', path: '/api/stores/:id', desc: 'Fiche magasin enrichie + historique des leads' },
      { method: 'PUT', path: '/api/stores/:id/lead', desc: 'Mise à jour du statut CRM (intéressé, contacté, client)' },
      { method: 'GET', path: '/api/stats', desc: 'Statistiques globales, par wilaya et indicateurs de qualité' },
    ];

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-emerald-700" />
            <h2 className="font-display text-base font-bold text-slate-900">
              API REST DistribDZ — Prête pour React Native & Flutter
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Toutes les routes sont sécurisées par jeton <code className="font-mono-tabular">Authorization: Bearer &lt;token&gt;</code> et retournent du JSON normalisé.
          </p>

          <div className="mt-5 divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {endpoints.map((ep) => (
              <div key={ep.path} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                    {ep.method}
                  </span>
                  <code className="font-mono-tabular text-emerald-700 font-medium">{ep.path}</code>
                </div>
                <span className="text-slate-600">{ep.desc}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Exemple d’intégration mobile (React Native / Flutter)
            </div>
            <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono-tabular overflow-x-auto">
{`const response = await fetch('/api/stores/nearby?lat=36.2864&lng=7.9511&radius_km=25', {
  headers: {
    'Authorization': 'Bearer <VOTRE_JETON>',
    'Content-Type': 'application/json'
  }
});
const { stores } = await response.json();`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <UserIcon className="w-5 h-5 text-emerald-700" />
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Mon Profil & Préférences de Matching
            </h2>
            <p className="text-xs text-slate-500">
              {user.email} · Rôle : {user.role === 'admin' ? 'Administrateur' : 'Producteur'}
              {user.territory_names && user.territory_names.length > 0
                ? ` · Territoires : ${user.territory_names.join(', ')}`
                : ''}
            </p>
          </div>
        </div>

        {msg && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {msg}
          </div>
        )}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nom complet</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Usine / Entreprise
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Secteur / Gamme de produits
              </label>
              <input
                type="text"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Ex: Laiterie, Boissons, Pâtes"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Wilaya prioritaire (Matching)
            </label>
            <select
              value={preferredWilayaId}
              onChange={(e) => setPreferredWilayaId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Aucune préférence</option>
              {wilayas.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Types de points de vente recherchés
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                ['superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche'] as StoreType[]
              ).map((t) => {
                const active = preferredTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setPreferredTypes((prev) =>
                        active ? prev.filter((x) => x !== t) : [...prev, t]
                      )
                    }
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {STORE_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mot de passe actuel (si modification)
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Enregistrement...' : 'Mettre à jour le profil'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
