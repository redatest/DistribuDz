import React, { useEffect, useState } from 'react';
import { Building2, Lock, Mail, MapPin, ShieldCheck, UserPlus, ArrowRight } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import type { StoreType, User, Wilaya } from '../types';
import { STORE_TYPE_LABELS } from '../lib/labels';

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

type AuthTab = 'login' | 'register' | 'bootstrap';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [tab, setTab] = useState<AuthTab>('login');
  const [hasAdmin, setHasAdmin] = useState<boolean>(true);
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Bootstrap Admin state
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Producer Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [regSector, setRegSector] = useState('Agroalimentaire & Boissons');
  const [regPhone, setRegPhone] = useState('');
  const [regWilayaId, setRegWilayaId] = useState<number | ''>('');
  const [regTypes, setRegTypes] = useState<StoreType[]>(['superette', 'magasin_gros']);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ has_admin: boolean }>('/api/auth/status'),
      apiFetch<{ wilayas: Wilaya[] }>('/api/wilayas'),
    ])
      .then(([statusRes, wilayaRes]) => {
        if (!active) return;
        setHasAdmin(statusRes.has_admin);
        if (!statusRes.has_admin) {
          setTab('bootstrap');
        }
        setWilayas(wilayaRes.wilayas);
        if (wilayaRes.wilayas.length > 0) {
          setRegWilayaId(wilayaRes.wilayas[0].id);
        }
      })
      .catch(() => {
        // Ignore initial load error
      });
    return () => {
      active = false;
    };
  }, []);

  const handleToggleRegType = (t: StoreType) => {
    setRegTypes((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]
    );
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/bootstrap-admin', {
        method: 'POST',
        body: JSON.stringify({
          email: adminEmail,
          full_name: adminName,
          password: adminPassword,
        }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: regName,
          email: regEmail,
          password: regPassword,
          company_name: regCompany,
          sector: regSector,
          phone: regPhone,
          preferred_wilaya_id: regWilayaId || null,
          preferred_store_types: regTypes,
        }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Brand / Value Proposition Panel */}
      <div className="lg:w-[44%] bg-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center font-display font-bold text-lg text-white">
              D
            </div>
            <span className="font-display font-bold text-xl tracking-tight">DistribDZ</span>
          </div>

          <div className="mt-12 lg:mt-16 max-w-md">
            <p className="text-xs font-medium text-emerald-400 tracking-wide">
              Réseau B2B Distribution Algérie
            </p>
            <h1 className="mt-3 font-display text-3xl lg:text-4xl font-bold leading-tight text-white [text-wrap:balance]">
              Connectez vos usines aux points de vente et grossistes d’Algérie.
            </h1>
            <p className="mt-4 text-sm lg:text-base text-slate-300 leading-relaxed">
              Centralisez les superettes, épiceries, hypermarchés et dépôts de vente en gros.
              Démarrez sur les 6 wilayas prioritaires de l’Est et étendez votre couverture sur
              l’ensemble des 58 wilayas.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-4 pt-8 border-t border-slate-800">
              <div>
                <div className="font-mono-tabular text-2xl font-semibold text-white">6 / 58</div>
                <div className="text-xs text-slate-400 mt-1">
                  Wilayas actives · Architecture 58 wilayas prête
                </div>
              </div>
              <div>
                <div className="font-mono-tabular text-2xl font-semibold text-emerald-400">API REST</div>
                <div className="text-xs text-slate-400 mt-1">
                  Géolocalisation, Matching & App Mobile
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>Souk Ahras</span>
          <span aria-hidden="true">·</span>
          <span>Tébessa</span>
          <span aria-hidden="true">·</span>
          <span>Annaba</span>
          <span aria-hidden="true">·</span>
          <span>Guelma</span>
          <span aria-hidden="true">·</span>
          <span>Skikda</span>
          <span aria-hidden="true">·</span>
          <span>Constantine</span>
        </div>
      </div>

      {/* Right Auth Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          {/* Segmented Mode Switch */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6">
            {!hasAdmin && (
              <button
                type="button"
                onClick={() => {
                  setTab('bootstrap');
                  setError(null);
                }}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab === 'bootstrap'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Config. Admin
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError(null);
              }}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inscription Producteur
            </button>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {tab === 'bootstrap' && !hasAdmin && (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Configuration initiale Administrateur</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Aucun administrateur n’est encore enregistré. Créez le compte administrateur
                  principal pour déverrouiller la gestion complète.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nom complet</label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Ex. Reda Benali"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email administrateur
                </label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@distribdz.dz"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mot de passe (min. 6 caractères)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Création en cours...' : 'Créer le compte Administrateur'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Accès plateforme DistribDZ
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connectez-vous avec votre compte Administrateur ou Producteur.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Adresse email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="nom@entreprise.dz"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Vérification...' : 'Se connecter'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Créer un compte Producteur
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Accédez aux points de vente, filtres géographiques et recommandations B2B.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nom complet
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Karim Mansouri"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Téléphone
                  </label>
                  <input
                    type="text"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+213 550 12 34 56"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Usine / Entreprise
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={regCompany}
                      onChange={(e) => setRegCompany(e.target.value)}
                      placeholder="SARL AgroEst"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Secteur d’activité
                  </label>
                  <input
                    type="text"
                    value={regSector}
                    onChange={(e) => setRegSector(e.target.value)}
                    placeholder="Produits laitiers, Boissons"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email professionnel
                </label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="commercial@usine.dz"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Wilaya prioritaire
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <select
                      value={regWilayaId}
                      onChange={(e) => setRegWilayaId(Number(e.target.value))}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      {wilayas.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mot de passe (min. 6)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Formats de distribution ciblés
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    ['superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche'] as StoreType[]
                  ).map((t) => {
                    const active = regTypes.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleToggleRegType(t)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {STORE_TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>{loading ? 'Création...' : 'Créer mon compte Producteur'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
