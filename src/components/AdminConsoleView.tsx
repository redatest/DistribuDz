import React, { useCallback, useEffect, useState } from 'react';
import { Check, Map, Play, Plus, RefreshCw, Search, Shield, Users, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { STORE_TYPE_LABELS } from '../lib/labels';
import type { ScrapingJob, StoreType, User, UserRole, Wilaya } from '../types';

interface AdminConsoleViewProps {
  section: 'wilayas' | 'scraping' | 'users';
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({ section }) => {
  // Wilayas state
  const [allWilayas, setAllWilayas] = useState<Wilaya[]>([]);
  const [wilayaSearch, setWilayaSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');

  // Scraping state
  const [jobs, setJobs] = useState<ScrapingJob[]>([]);
  const [selectedScrapeWilayas, setSelectedScrapeWilayas] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<StoreType[]>([
    'superette',
    'mini_market',
    'epicerie',
    'magasin_gros',
    'hypermarche',
    'autre',
  ]);
  const [maxResults, setMaxResults] = useState<number>(0);
  const [customKeywords, setCustomKeywords] = useState<string>(
    'supermarché, superette, mini market, grocery store, alimentation générale, magasin alimentation, aswak, épicerie, magasin de gros, hypermarché, تغذية عامة, مواد غذائية, سوبيرات, أسواق'
  );
  const [runningScrape, setRunningScrape] = useState(false);

  // Users & Territories state
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('producer');
  const [newUserCompany, setNewUserCompany] = useState('');
  const [newUserSector, setNewUserSector] = useState('');
  const [newUserTerritories, setNewUserTerritories] = useState<number[]>([]);

  // Territory editor modal
  const [editingTerritoryUser, setEditingTerritoryUser] = useState<User | null>(null);
  const [territoryDraft, setTerritoryDraft] = useState<number[]>([]);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWilayas = useCallback(async () => {
    const res = await apiFetch<{ wilayas: Wilaya[] }>('/api/wilayas?all=1');
    setAllWilayas(res.wilayas);
    const activeIds = res.wilayas.filter((w) => w.is_active).map((w) => w.id);
    setSelectedScrapeWilayas((prev) => (prev.length === 0 ? activeIds : prev));
  }, []);

  const loadJobs = useCallback(async () => {
    const res = await apiFetch<{ jobs: ScrapingJob[] }>('/api/admin/scraping-jobs');
    setJobs(res.jobs);
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await apiFetch<{ users: User[] }>('/api/admin/users');
    setUsers(res.users);
  }, []);

  useEffect(() => {
    setError(null);
    setMessage(null);
    loadWilayas().catch((e) => setError(e.message));
    if (section === 'scraping') loadJobs().catch((e) => setError(e.message));
    if (section === 'users') loadUsers().catch((e) => setError(e.message));
  }, [section, loadWilayas, loadJobs, loadUsers]);

  const handleToggleWilaya = async (w: Wilaya) => {
    setError(null);
    try {
      await apiFetch(`/api/wilayas/${w.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !w.is_active }),
      });
      await loadWilayas();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de mise à jour.');
    }
  };

  const handleLaunchScrape = async () => {
    if (selectedScrapeWilayas.length === 0) {
      setError('Sélectionnez au moins une wilaya.');
      return;
    }
    setRunningScrape(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{
        job: { inserted_count: number; duplicate_count: number; found_count: number };
      }>('/api/admin/scraping-jobs', {
        method: 'POST',
        body: JSON.stringify({
          wilaya_ids: selectedScrapeWilayas,
          categories: selectedCategories,
          max_results: maxResults,
          custom_keywords: customKeywords,
        }),
      });
      setMessage(
        `Collecte terminée : ${res.job.found_count} points analysés, ${res.job.inserted_count} nouveaux magasins importés, ${res.job.duplicate_count} doublons ignorés.`
      );
      await Promise.all([loadJobs(), loadWilayas()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de collecte.');
    } finally {
      setRunningScrape(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: newUserEmail,
          full_name: newUserName,
          password: newUserPassword,
          role: newUserRole,
          company_name: newUserCompany,
          sector: newUserSector,
          territory_wilaya_ids: newUserTerritories,
        }),
      });
      setShowUserModal(false);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserPassword('');
      setNewUserCompany('');
      setNewUserSector('');
      setNewUserTerritories([]);
      await loadUsers();
      setMessage('Compte utilisateur créé.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de création.');
    }
  };

  const handleToggleUserActive = async (u: User) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de modification.');
    }
  };

  const handleSaveTerritories = async () => {
    if (!editingTerritoryUser) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${editingTerritoryUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ territory_wilaya_ids: territoryDraft }),
      });
      setEditingTerritoryUser(null);
      await loadUsers();
      setMessage('Territoires commerciaux mis à jour.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de mise à jour.');
    }
  };

  const filteredWilayas = allWilayas.filter((w) => {
    const matchRegion = regionFilter === 'ALL' || w.region === regionFilter;
    const matchQ =
      !wilayaSearch.trim() ||
      w.name.toLowerCase().includes(wilayaSearch.toLowerCase()) ||
      w.code.includes(wilayaSearch.trim());
    return matchRegion && matchQ;
  });

  const activeWilayasList = allWilayas.filter((w) => w.is_active);

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {message}
        </div>
      )}

      {/* SECTION 1: 58 WILAYAS */}
      {section === 'wilayas' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Gestion évolutive des 58 Wilayas d’Algérie
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Activez ou désactivez dynamiquement n’importe quelle wilaya. Les 7 wilayas
                prioritaires (Souk Ahras, Tébessa, Annaba, Guelma, Skikda, Constantine, Sétif)
                sont activées par défaut.
              </p>
            </div>
            <div className="font-mono-tabular text-xs font-semibold text-emerald-700 whitespace-nowrap">
              {activeWilayasList.length} / {allWilayas.length} actives
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={wilayaSearch}
                onChange={(e) => setWilayaSearch(e.target.value)}
                placeholder="Filtrer par nom ou code (ex: 16, Oran, Annaba)..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['ALL', 'Est', 'Centre', 'Ouest', 'Sud'] as const).map((reg) => (
                <button
                  key={reg}
                  type="button"
                  onClick={() => setRegionFilter(reg)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    regionFilter === reg
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {reg === 'ALL' ? 'Toutes' : reg}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Wilaya</th>
                    <th className="py-2.5 px-4">Région</th>
                    <th className="py-2.5 px-4">Centre GPS</th>
                    <th className="py-2.5 px-4 text-right">Magasins</th>
                    <th className="py-2.5 px-4 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredWilayas.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono-tabular font-semibold text-slate-900">
                        {w.code}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-medium text-slate-900">{w.name}</span>
                        <span className="ml-2 text-slate-400">{w.name_ar}</span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{w.region}</td>
                      <td className="py-2.5 px-4 font-mono-tabular text-slate-500">
                        {w.latitude.toFixed(3)}, {w.longitude.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-tabular font-medium text-slate-900">
                        {w.store_count ?? 0}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleWilaya(w)}
                          className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
                            w.is_active
                              ? 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {w.is_active ? 'Active' : 'Activer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: SCRAPING GOOGLE MAPS */}
      {section === 'scraping' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Extraction & importation Google Maps par Wilaya
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Lancez une collecte ciblée avec déduplication automatique par nom normalisé et
                  proximité GPS. Pour le scraping Playwright autonome à grande échelle, utilisez
                  également le script Python dans <code className="font-mono-tabular">flask_app/scripts/scrape_google_maps.py</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLaunchScrape}
                disabled={runningScrape}
                className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {runningScrape ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>
                  {runningScrape ? 'Collecte en cours...' : 'Lancer l’extraction Google Maps'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-semibold text-slate-700">
                    1. Wilayas cibles ({selectedScrapeWilayas.length} / {allWilayas.length})
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedScrapeWilayas(
                          allWilayas
                            .filter((w) => ['41', '12', '23', '24', '21', '25', '19'].includes(w.code))
                            .map((w) => w.id)
                        )
                      }
                      className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                    >
                      7 Wilayas Est
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedScrapeWilayas(
                          allWilayas.filter((w) => w.is_active).map((w) => w.id)
                        )
                      }
                      className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                    >
                      Toutes actives
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedScrapeWilayas(allWilayas.map((w) => w.id))}
                      className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                    >
                      58 Wilayas
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedScrapeWilayas([])}
                      className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"
                    >
                      Vider
                    </button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2">
                  {allWilayas.map((w) => {
                    const checked = selectedScrapeWilayas.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() =>
                          setSelectedScrapeWilayas((prev) =>
                            checked ? prev.filter((id) => id !== w.id) : [...prev, w.id]
                          )
                        }
                        className={`px-2.5 py-1.5 text-left text-xs rounded-md border flex items-center justify-between gap-1 transition-colors ${
                          checked
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-medium'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">
                          {w.code} · {w.name}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <span className="font-mono-tabular text-[10px] text-slate-400">
                            {w.store_count ?? 0}
                          </span>
                          {checked && <Check className="w-3.5 h-3.5 text-emerald-700" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    2. Formats Google Maps à extraire
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        'superette',
                        'mini_market',
                        'epicerie',
                        'magasin_gros',
                        'hypermarche',
                        'autre',
                      ] as StoreType[]
                    ).map((cat) => {
                      const active = selectedCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() =>
                            setSelectedCategories((prev) =>
                              active
                                ? prev.length > 1
                                  ? prev.filter((c) => c !== cat)
                                  : prev
                                : [...prev, cat]
                            )
                          }
                          className={`p-2.5 text-left text-xs rounded-lg border transition-colors ${
                            active
                              ? 'bg-emerald-700 text-white border-emerald-700 font-medium'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {STORE_TYPE_LABELS[cat]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      3. Profondeur d’extraction
                    </label>
                    <select
                      value={maxResults}
                      onChange={(e) => setMaxResults(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value={0}>Complète — Illimitée (toutes communes)</option>
                      <option value={15}>Rapide — 15 magasins / wilaya</option>
                      <option value={30}>Étendue — 30 magasins / wilaya</option>
                      <option value={60}>Large — 60 magasins / wilaya</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mots-clés Google Maps
                    </label>
                    <input
                      type="text"
                      value={customKeywords}
                      onChange={(e) => setCustomKeywords(e.target.value)}
                      placeholder="superette, mini market, grocery store..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-[11px] text-slate-600 space-y-1.5">
              <div className="font-semibold text-slate-800">
                Stratégie de découverte étendue (commerces de quartier en Algérie)
              </div>
              <p>
                Les commerces locaux (ex. <em>Supérette Loula / Lola</em> ou <em>Supérette Bounefla</em>) échappent souvent aux recherches globales par wilaya à cause du plafond d’affichage cartographique, des écarts de translittération (<em>ou ↔ o</em>) et des intitulés administratifs. L’extraction combine désormais :
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div className="bg-white border border-slate-200 rounded p-2">
                  <strong className="text-slate-800">1. Grille Cités & Communes</strong>
                  <div className="text-slate-500 mt-0.5">Scan ciblé par quartiers (Cité Adjabi, 18 Février, 19 Juin, Oued Zenati…)</div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <strong className="text-slate-800">2. Intitulés terrain DZ</strong>
                  <div className="text-slate-500 mt-0.5">Inclut « Alimentation générale », « تغذية عامة », « مواد غذائية » et noms de gérants</div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <strong className="text-slate-800">3. Phonétique FR/AR</strong>
                  <div className="text-slate-500 mt-0.5">Normalisation automatique <em>ou↔o</em> (Loula/Lola), <em>k↔q</em> et tolérance 1 faute</div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <strong className="text-slate-800">4. Google Places, PagesMaghreb, DCW & OSM</strong>
                  <div className="text-slate-500 mt-0.5">Grille GPS 2,5 km Places API (si clé active), OpenStreetMap, <code>PagesMaghreb</code> (tél. vérifiés) et PDF <code>dcw*.dz</code></div>
                </div>
              </div>
            </div>
          </div>

          {/* Job History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Historique des collectes Google Maps
              </h3>
            </div>
            {jobs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Aucune collecte lancée pour le moment. Sélectionnez des wilayas ci-dessus pour
                enrichir la base de données.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <div key={job.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">
                        Collecte #{job.id} — {job.wilaya_names.join(', ')}
                      </div>
                      <div className="text-slate-500 mt-0.5">{job.log_summary}</div>
                    </div>
                    <div className="font-mono-tabular text-right shrink-0">
                      <span className="text-emerald-700 font-semibold">
                        +{job.inserted_count} importés
                      </span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="text-slate-500">{job.duplicate_count} doublons</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: USERS & TERRITORIES */}
      {section === 'users' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Utilisateurs & Attribution des Territoires
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Créez des comptes producteurs/commerciaux, gérez leur statut et assignez leurs
                wilayas de prospection.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUserModal(true)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvel utilisateur</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Utilisateur</th>
                    <th className="py-3 px-4">Rôle & Usine</th>
                    <th className="py-3 px-4">Territoires assignés</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{u.full_name}</div>
                        <div className="text-slate-500">{u.email}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium flex items-center gap-1">
                          {u.role === 'admin' ? (
                            <Shield className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>{u.role === 'admin' ? 'Administrateur' : 'Producteur'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {u.company_name || '—'} {u.sector ? `· ${u.sector}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {u.territory_names && u.territory_names.length > 0
                          ? u.territory_names.join(', ')
                          : 'Accès global (non restreint)'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            u.is_active ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {u.is_active ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTerritoryUser(u);
                            setTerritoryDraft(u.territory_wilaya_ids);
                          }}
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-100 text-slate-700 inline-flex items-center gap-1"
                        >
                          <Map className="w-3 h-3" />
                          <span>Territoires</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleUserActive(u)}
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-100 text-slate-700"
                        >
                          {u.is_active ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* New User Modal */}
          {showUserModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Créer un compte utilisateur
                  </h3>
                  <button type="button" onClick={() => setShowUserModal(false)}>
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <form onSubmit={handleCreateUser} className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nom complet *
                      </label>
                      <input
                        type="text"
                        required
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Rôle</label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="producer">Producteur / Commercial</option>
                        <option value="admin">Administrateur</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Mot de passe *
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Usine / Entreprise
                      </label>
                      <input
                        type="text"
                        value={newUserCompany}
                        onChange={(e) => setNewUserCompany(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Secteur</label>
                    <input
                      type="text"
                      value={newUserSector}
                      onChange={(e) => setNewUserSector(e.target.value)}
                      placeholder="Ex: Boissons, Laiterie, Biscuiterie"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Territoires assignés (Wilayas actives)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {activeWilayasList.map((w) => {
                        const sel = newUserTerritories.includes(w.id);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() =>
                              setNewUserTerritories((prev) =>
                                sel ? prev.filter((x) => x !== w.id) : [...prev, w.id]
                              )
                            }
                            className={`px-2.5 py-1 text-xs rounded-md border ${
                              sel
                                ? 'bg-emerald-700 text-white border-emerald-700'
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            {w.code} · {w.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="pt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUserModal(false)}
                      className="px-4 py-2 text-xs border border-slate-300 rounded-lg"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                    >
                      Créer le compte
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Territory Editor Modal */}
          {editingTerritoryUser && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Territoires de {editingTerritoryUser.full_name}
                  </h3>
                  <button type="button" onClick={() => setEditingTerritoryUser(null)}>
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Sélectionnez les wilayas attribuées à ce commercial / producteur.
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {activeWilayasList.map((w) => {
                    const sel = territoryDraft.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() =>
                          setTerritoryDraft((prev) =>
                            sel ? prev.filter((x) => x !== w.id) : [...prev, w.id]
                          )
                        }
                        className={`px-3 py-2 text-left text-xs rounded-lg border flex items-center justify-between ${
                          sel
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-medium'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <span>
                          {w.code} · {w.name}
                        </span>
                        {sel && <Check className="w-3.5 h-3.5 text-emerald-700" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTerritoryUser(null)}
                    className="px-4 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTerritories}
                    className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                  >
                    Enregistrer les territoires
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
