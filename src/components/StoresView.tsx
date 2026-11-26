import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  Download,
  FileSpreadsheet,
  Globe,
  Layers,
  List,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { apiFetch, exportStoresCsv, exportStoresExcel } from '../lib/api';
import { LEAD_STATUS_LABELS, STORE_TYPE_LABELS } from '../lib/labels';
import type { Store, StoreType, User, Wilaya } from '../types';

interface StoresViewProps {
  user: User;
  onSelectStore: (storeId: number) => void;
}

interface CommuneOption {
  name: string;
  count: number;
}

export const StoresView: React.FC<StoresViewProps> = ({ user, onSelectStore }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [availableCommunes, setAvailableCommunes] = useState<CommuneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Presentation mode: grouped by Wilaya -> Ville/Commune by default
  const [groupByCommune, setGroupByCommune] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Filters
  const [q, setQ] = useState('');
  const [wilayaId, setWilayaId] = useState<string>('');
  const [communeFilter, setCommuneFilter] = useState<string>('');
  const [storeType, setStoreType] = useState<string>('');
  const [minRating, setMinRating] = useState<string>('');
  const [hasPhone, setHasPhone] = useState(false);
  const [territoryOnly, setTerritoryOnly] = useState(false);
  const [sortBy, setSortBy] = useState('rating');

  // Geolocation radius filter
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLng, setGeoLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(35);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [discoveringLive, setDiscoveringLive] = useState(false);
  const [liveMsg, setLiveMsg] = useState<string | null>(null);

  // Admin Add Store Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formWilayaId, setFormWilayaId] = useState<number>(0);
  const [formType, setFormType] = useState<StoreType>('superette');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formLat, setFormLat] = useState('36.2864');
  const [formLng, setFormLng] = useState('7.9511');
  const [formRating, setFormRating] = useState('4.5');
  const [formHours, setFormHours] = useState('08:00 - 22:30');
  const [formProducts, setFormProducts] = useState('');
  const [formSurface, setFormSurface] = useState('220');
  const [formClientele, setFormClientele] = useState('Détail urbain');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ wilayas: Wilaya[] }>('/api/wilayas')
      .then((res) => {
        setWilayas(res.wilayas);
        if (res.wilayas.length > 0) {
          setFormWilayaId(res.wilayas[0].id);
          setFormLat(String(res.wilayas[0].latitude));
          setFormLng(String(res.wilayas[0].longitude));
        }
      })
      .catch(() => {});
  }, []);

  const loadStores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (wilayaId) params.set('wilaya_id', wilayaId);
      if (communeFilter) params.set('commune', communeFilter);
      if (storeType) params.set('store_type', storeType);
      if (minRating) params.set('min_rating', minRating);
      if (hasPhone) params.set('has_phone', '1');
      if (territoryOnly) params.set('territory_only', '1');
      if (geoLat !== null && geoLng !== null) {
        params.set('lat', String(geoLat));
        params.set('lng', String(geoLng));
        params.set('radius_km', String(radiusKm));
        params.set('sort', 'distance');
      } else {
        params.set('sort', sortBy);
      }

      const res = await apiFetch<{ stores: Store[]; communes?: CommuneOption[] }>(
        `/api/stores?${params.toString()}`
      );
      setStores(res.stores);
      setAvailableCommunes(res.communes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [
    q,
    wilayaId,
    communeFilter,
    storeType,
    minRating,
    hasPhone,
    territoryOnly,
    geoLat,
    geoLng,
    radiusKm,
    sortBy,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStores();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadStores]);

  const handleUseGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Géolocalisation non supportée par votre navigateur.');
      return;
    }
    setGeoStatus('Localisation en cours...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(Number(pos.coords.latitude.toFixed(4)));
        setGeoLng(Number(pos.coords.longitude.toFixed(4)));
        setGeoStatus(null);
      },
      () => {
        // Fallback: center on selected wilaya or Souk Ahras if denied in iframe
        const fallbackW = wilayas.find((w) => String(w.id) === wilayaId) || wilayas[0];
        if (fallbackW) {
          setGeoLat(fallbackW.latitude);
          setGeoLng(fallbackW.longitude);
          setGeoStatus(`Position centrée sur ${fallbackW.name} (GPS navigateur bloqué)`);
        } else {
          setGeoStatus('Accès GPS refusé.');
        }
      }
    );
  };

  const handleClearGeo = () => {
    setGeoLat(null);
    setGeoLng(null);
    setGeoStatus(null);
  };

  const handleLiveDiscover = async () => {
    if (q.trim().length < 2) return;
    setDiscoveringLive(true);
    setLiveMsg(null);
    setError(null);
    try {
      const res = await apiFetch<{ discovered_count: number; inserted_count: number }>(
        '/api/stores/live-discover',
        {
          method: 'POST',
          body: JSON.stringify({
            query: q.trim(),
            wilaya_id: wilayaId ? Number(wilayaId) : null,
          }),
        }
      );
      if (res.inserted_count > 0) {
        setLiveMsg(
          `Recherche étendue en direct : ${res.discovered_count} résultats externes analysés, ${res.inserted_count} nouveaux magasins ajoutés.`
        );
      } else if (res.discovered_count > 0) {
        setLiveMsg(
          `Recherche étendue en direct : ${res.discovered_count} correspondances déjà présentes dans votre base.`
        );
      } else {
        setLiveMsg(
          'Recherche étendue terminée : aucun résultat externe supplémentaire trouvé pour cette requête.'
        );
      }
      const wilayaRes = await apiFetch<{ wilayas: Wilaya[] }>('/api/wilayas');
      setWilayas(wilayaRes.wilayas);
      await loadStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la recherche étendue.');
    } finally {
      setDiscoveringLive(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setSaving(true);
    try {
      await apiFetch('/api/stores', {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          wilaya_id: formWilayaId,
          store_type: formType,
          address: formAddress,
          phone: formPhone,
          latitude: Number(formLat),
          longitude: Number(formLng),
          rating: formRating ? Number(formRating) : null,
          opening_hours: formHours,
          main_products: formProducts,
          approx_surface_m2: formSurface ? Number(formSurface) : null,
          clientele_type: formClientele,
        }),
      });
      setShowAddModal(false);
      setFormName('');
      setFormAddress('');
      setFormPhone('');
      setFormProducts('');
      loadStores();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
    } finally {
      setSaving(false);
    }
  };

  const groupedByWilaya = useMemo(() => {
    const wilayaMap = new Map<
      string,
      {
        wilaya_id: number;
        wilaya_code: string;
        wilaya_name: string;
        total: number;
        communesMap: Map<string, Store[]>;
      }
    >();

    for (const s of stores) {
      const wKey = `${s.wilaya_code}::${s.wilaya_name}`;
      let wGroup = wilayaMap.get(wKey);
      if (!wGroup) {
        wGroup = {
          wilaya_id: s.wilaya_id,
          wilaya_code: s.wilaya_code,
          wilaya_name: s.wilaya_name,
          total: 0,
          communesMap: new Map<string, Store[]>(),
        };
        wilayaMap.set(wKey, wGroup);
      }
      wGroup.total += 1;
      const cName = s.commune || `${s.wilaya_name} (Chef-lieu)`;
      const list = wGroup.communesMap.get(cName) || [];
      list.push(s);
      wGroup.communesMap.set(cName, list);
    }

    return Array.from(wilayaMap.values())
      .sort((a, b) => a.wilaya_code.localeCompare(b.wilaya_code, 'fr'))
      .map((w) => {
        const communes = Array.from(w.communesMap.entries())
          .map(([communeName, items]) => ({
            name: communeName,
            isChefLieu: communeName.includes('(Chef-lieu)'),
            stores: items,
          }))
          .sort((a, b) => {
            if (a.isChefLieu !== b.isChefLieu) return a.isChefLieu ? -1 : 1;
            return b.stores.length - a.stores.length || a.name.localeCompare(b.name, 'fr');
          });
        return {
          wilaya_id: w.wilaya_id,
          wilaya_code: w.wilaya_code,
          wilaya_name: w.wilaya_name,
          total: w.total,
          communes,
        };
      });
  }, [stores]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-5">
      {/* Toolbar & Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2 max-w-2xl">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (liveMsg) setLiveMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && q.trim().length >= 2) {
                    e.preventDefault();
                    handleLiveDiscover();
                  }
                }}
                placeholder="Rechercher Aswak El Baraka, superette, mini market, produits..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <button
              type="button"
              onClick={handleLiveDiscover}
              disabled={discoveringLive || q.trim().length < 2}
              title="Rechercher en direct sur Google Places (si clé active), OpenStreetMap, PagesMaghreb et registres DCW (FR & AR)"
              className="px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg flex items-center gap-1.5 disabled:opacity-45 whitespace-nowrap"
            >
              {discoveringLive ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
              <span>{discoveringLive ? 'Recherche...' : 'Étendre en direct'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportStoresCsv(stores)}
              disabled={stores.length === 0}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => exportStoresExcel(stores)}
              disabled={stores.length === 0}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excel (.xlsx)</span>
            </button>
            {user.role === 'admin' && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter un magasin</span>
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
          <select
            value={wilayaId}
            onChange={(e) => {
              setWilayaId(e.target.value);
              setCommuneFilter('');
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Toutes les wilayas actives</option>
            {wilayas.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name} ({w.store_count ?? 0})
              </option>
            ))}
          </select>

          <select
            value={communeFilter}
            onChange={(e) => setCommuneFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Toutes les villes / communes ({availableCommunes.length})</option>
            {availableCommunes.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>

          <select
            value={storeType}
            onChange={(e) => setStoreType(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Tous les formats</option>
            {(
              ['superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche', 'autre'] as StoreType[]
            ).map((t) => (
              <option key={t} value={t}>
                {STORE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          <select
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Note Google : Toutes</option>
            <option value="4.0">Note ≥ 4.0 ★</option>
            <option value="4.3">Note ≥ 4.3 ★</option>
            <option value="4.5">Note ≥ 4.5 ★</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            disabled={geoLat !== null}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"
          >
            <option value="rating">Trier : Meilleure note</option>
            <option value="reviews">Trier : Plus d’avis</option>
            <option value="quality">Trier : Qualité fiche</option>
            <option value="recent">Trier : Récents</option>
          </select>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHasPhone(!hasPhone)}
              className={`flex-1 py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                hasPhone
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Avec tél.
            </button>
            {user.territory_wilaya_ids.length > 0 && (
              <button
                type="button"
                onClick={() => setTerritoryOnly(!territoryOnly)}
                className={`flex-1 py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  territoryOnly
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Mon territoire
              </button>
            )}
          </div>
        </div>

        {/* Geolocation Radius Filter Bar + Presentation Mode */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleUseGeolocation}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5 text-emerald-700" />
              <span>Recherche par rayon GPS</span>
            </button>
            {geoLat !== null && geoLng !== null && (
              <>
                <span className="font-mono-tabular text-slate-600">
                  Centre : {geoLat}, {geoLng}
                </span>
                <label className="flex items-center gap-2 text-slate-700">
                  <span>Rayon :</span>
                  <input
                    type="range"
                    min={5}
                    max={150}
                    step={5}
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="accent-emerald-700"
                  />
                  <span className="font-mono-tabular font-semibold">{radiusKm} km</span>
                </label>
                <button
                  type="button"
                  onClick={handleClearGeo}
                  className="text-red-600 hover:underline flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Réinitialiser GPS</span>
                </button>
              </>
            )}
            {geoStatus && <span className="text-amber-700">{geoStatus}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setGroupByCommune(true)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md flex items-center gap-1.5 transition-colors ${
                  groupByCommune
                    ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Par Ville & Commune</span>
              </button>
              <button
                type="button"
                onClick={() => setGroupByCommune(false)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md flex items-center gap-1.5 transition-colors ${
                  !groupByCommune
                    ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Liste unifiée</span>
              </button>
            </div>
            <div className="font-mono-tabular text-slate-500">
              {stores.length} magasin{stores.length > 1 ? 's' : ''} affiché{stores.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {liveMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
          {liveMsg}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : stores.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <SlidersHorizontal className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-medium text-slate-900">
              Aucun magasin local ne correspond à vos critères
            </div>
            <p className="text-xs text-slate-500">
              Élargissez le rayon géographique, réinitialisez les filtres ou lancez une recherche
              externe en direct (FR & Arabe).
            </p>
            {q.trim().length >= 2 && (
              <button
                type="button"
                onClick={handleLiveDiscover}
                disabled={discoveringLive}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
              >
                {discoveringLive ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span>Étendre la recherche en direct pour « {q.trim()} »</span>
              </button>
            )}
          </div>
        ) : groupByCommune ? (
          <div className="divide-y divide-slate-200">
            {groupedByWilaya.map((wGroup) => {
              const wKey = `w-${wGroup.wilaya_code}`;
              const wCollapsed = Boolean(collapsedGroups[wKey]);
              return (
                <section key={wKey} className="bg-white">
                  {/* Wilaya Header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(wKey)}
                    className="w-full px-4 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-left hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {wCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      <span className="font-mono-tabular text-xs font-semibold text-emerald-300">
                        Wilaya {wGroup.wilaya_code}
                      </span>
                      <span className="font-display text-sm font-bold">{wGroup.wilaya_name}</span>
                    </div>
                    <div className="text-xs text-slate-300 font-mono-tabular">
                      {wGroup.communes.length} ville{wGroup.communes.length > 1 ? 's / communes' : ' / commune'} ·{' '}
                      <strong className="text-white">{wGroup.total}</strong> point{wGroup.total > 1 ? 's' : ''} de vente
                    </div>
                  </button>

                  {!wCollapsed && (
                    <div className="divide-y divide-slate-200">
                      {wGroup.communes.map((cGroup) => {
                        const cKey = `c-${wGroup.wilaya_code}-${cGroup.name}`;
                        const cCollapsed = Boolean(collapsedGroups[cKey]);
                        const wholesaleCount = cGroup.stores.filter(
                          (x) => x.store_type === 'magasin_gros'
                        ).length;
                        return (
                          <div key={cKey} className="bg-white">
                            {/* Commune / Ville Sub-header */}
                            <button
                              type="button"
                              onClick={() => toggleGroup(cKey)}
                              className="w-full px-5 py-2.5 bg-slate-50 hover:bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-left transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {cCollapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-emerald-700" />
                                )}
                                <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span className="font-display text-xs font-bold text-slate-900">
                                  {cGroup.name}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono-tabular flex items-center gap-3">
                                {wholesaleCount > 0 && (
                                  <span className="text-amber-700 font-medium">
                                    {wholesaleCount} grossiste{wholesaleCount > 1 ? 's' : ''}
                                  </span>
                                )}
                                <span>
                                  <strong className="text-slate-800">{cGroup.stores.length}</strong> magasin
                                  {cGroup.stores.length > 1 ? 's' : ''}
                                </span>
                              </div>
                            </button>

                            {!cCollapsed && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-100 bg-white text-[11px] font-semibold text-slate-400">
                                      <th className="py-2 px-5">Point de vente</th>
                                      <th className="py-2 px-4">Format</th>
                                      <th className="py-2 px-4">Téléphone</th>
                                      <th className="py-2 px-4">Surface / Clientèle</th>
                                      <th className="py-2 px-4 text-right">Note Google</th>
                                      {geoLat !== null && <th className="py-2 px-4 text-right">Distance</th>}
                                      <th className="py-2 px-5 text-right">Suivi Lead</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-xs">
                                    {cGroup.stores.map((s) => (
                                      <tr
                                        key={s.id}
                                        onClick={() => onSelectStore(s.id)}
                                        className="hover:bg-emerald-50/40 cursor-pointer transition-colors"
                                      >
                                        <td className="py-2.5 px-5">
                                          <div className="font-semibold text-slate-900">{s.name}</div>
                                          <div className="text-[11px] text-slate-500 truncate max-w-sm">
                                            {s.address || 'Adresse non renseignée'}
                                          </div>
                                        </td>
                                        <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                                          {STORE_TYPE_LABELS[s.store_type]}
                                        </td>
                                        <td className="py-2.5 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                                          {s.phone || <span className="text-slate-400">Non disponible</span>}
                                        </td>
                                        <td className="py-2.5 px-4 text-slate-600">
                                          {s.approx_surface_m2 ? (
                                            <span className="font-mono-tabular">{s.approx_surface_m2} m²</span>
                                          ) : (
                                            '—'
                                          )}
                                          {s.clientele_type && (
                                            <>
                                              <span className="mx-1.5 text-slate-300" aria-hidden="true">
                                                ·
                                              </span>
                                              <span>{s.clientele_type}</span>
                                            </>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-mono-tabular whitespace-nowrap">
                                          {s.rating !== null ? (
                                            <span>
                                              <strong className="text-slate-900">{s.rating.toFixed(1)} ★</strong>{' '}
                                              <span className="text-slate-400">({s.review_count})</span>
                                            </span>
                                          ) : (
                                            '—'
                                          )}
                                        </td>
                                        {geoLat !== null && (
                                          <td className="py-2.5 px-4 text-right font-mono-tabular text-emerald-700 font-medium whitespace-nowrap">
                                            {s.distance_km !== undefined ? `${s.distance_km} km` : '—'}
                                          </td>
                                        )}
                                        <td className="py-2.5 px-5 text-right whitespace-nowrap">
                                          {s.lead_status ? (
                                            <span className="font-medium text-emerald-700">
                                              {LEAD_STATUS_LABELS[s.lead_status]}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">À prospecter</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Point de vente</th>
                  <th className="py-3 px-4">Wilaya · Ville / Commune & Format</th>
                  <th className="py-3 px-4">Téléphone</th>
                  <th className="py-3 px-4">Surface / Clientèle</th>
                  <th className="py-3 px-4 text-right">Note Google</th>
                  {geoLat !== null && <th className="py-3 px-4 text-right">Distance</th>}
                  <th className="py-3 px-4 text-right">Suivi Lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {stores.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => onSelectStore(s.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">
                        {s.address || 'Adresse non renseignée'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      <span>{s.wilaya_name}</span>
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-medium text-slate-800">{s.commune}</span>
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-600">{STORE_TYPE_LABELS[s.store_type]}</span>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {s.phone || <span className="text-slate-400">Non disponible</span>}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.approx_surface_m2 ? (
                        <span className="font-mono-tabular">{s.approx_surface_m2} m²</span>
                      ) : (
                        '—'
                      )}
                      {s.clientele_type && (
                        <>
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span>{s.clientele_type}</span>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                      {s.rating !== null ? (
                        <span>
                          <strong className="text-slate-900">{s.rating.toFixed(1)} ★</strong>{' '}
                          <span className="text-slate-400">({s.review_count})</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {geoLat !== null && (
                      <td className="py-3 px-4 text-right font-mono-tabular text-emerald-700 font-medium whitespace-nowrap">
                        {s.distance_km !== undefined ? `${s.distance_km} km` : '—'}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {s.lead_status ? (
                        <span className="font-medium text-emerald-700">
                          {LEAD_STATUS_LABELS[s.lead_status]}
                        </span>
                      ) : (
                        <span className="text-slate-400">À prospecter</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin Add Store Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                Ajouter un point de vente
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateStore} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nom du magasin *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Superette El Baraka"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Wilaya *</label>
                  <select
                    value={formWilayaId}
                    onChange={(e) => {
                      const wid = Number(e.target.value);
                      setFormWilayaId(wid);
                      const w = wilayas.find((x) => x.id === wid);
                      if (w) {
                        setFormLat(String(w.latitude));
                        setFormLng(String(w.longitude));
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {wilayas.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Format *</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as StoreType)}
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Téléphone
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+213 550 00 00 00"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Adresse complète
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Rue, Quartier, Commune"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Latitude *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={formLat}
                    onChange={(e) => setFormLat(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Longitude *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={formLng}
                    onChange={(e) => setFormLng(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Note Google
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    value={formRating}
                    onChange={(e) => setFormRating(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Horaires d’ouverture
                  </label>
                  <input
                    type="text"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Surface approx. (m²)
                  </label>
                  <input
                    type="number"
                    value={formSurface}
                    onChange={(e) => setFormSurface(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Produits principaux vendus
                  </label>
                  <input
                    type="text"
                    value={formProducts}
                    onChange={(e) => setFormProducts(e.target.value)}
                    placeholder="Laiterie, Boissons, Huiles..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Type de clientèle
                  </label>
                  <input
                    type="text"
                    value={formClientele}
                    onChange={(e) => setFormClientele(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer le magasin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
