import React, { useEffect, useMemo, useState } from 'react';
import { Database, Download, ExternalLink, LoaderCircle, MapPin, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { STORE_TYPE_LABELS } from '../lib/labels';
import type { StoreType, Wilaya } from '../types';

type OsmCandidate = {
  key: string;
  osm_type: string;
  osm_id: number;
  name: string;
  store_type: StoreType;
  address: string | null;
  phone: string | null;
  opening_hours: string | null;
  latitude: number;
  longitude: number;
  osm_url: string;
  duplicate: boolean;
};

const EAST_WILAYA_CODES = ['41', '12', '23', '24', '21', '25', '19'];

export const OSMDiscoveryView: React.FC = () => {
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [wilayaId, setWilayaId] = useState('');
  const [candidates, setCandidates] = useState<OsmCandidate[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loadingWilayas, setLoadingWilayas] = useState(true);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attributionUrl, setAttributionUrl] = useState('https://www.openstreetmap.org/copyright');

  useEffect(() => {
    apiFetch<{ wilayas: Wilaya[] }>('/api/wilayas?all=1')
      .then(({ wilayas: rows }) => {
        setWilayas(rows);
        const defaultWilaya = rows.find((w) => w.code === '25') || rows.find((w) => w.code === '41') || rows[0];
        if (defaultWilaya) setWilayaId(String(defaultWilaya.id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Impossible de charger les wilayas.'))
      .finally(() => setLoadingWilayas(false));
  }, []);

  const selectedWilaya = useMemo(() => wilayas.find((w) => String(w.id) === wilayaId), [wilayas, wilayaId]);
  const importable = candidates.filter((item) => !item.duplicate);
  const selectedItems = candidates.filter((item) => selectedKeys.includes(item.key) && !item.duplicate);

  const runPreview = async () => {
    if (!wilayaId) return;
    setSearching(true);
    setError('');
    setMessage('');
    setCandidates([]);
    setSelectedKeys([]);
    try {
      const result = await apiFetch<{
        candidates: OsmCandidate[];
        attribution_url: string;
      }>('/api/discovery/osm/preview', {
        method: 'POST',
        body: JSON.stringify({ wilaya_id: Number(wilayaId) }),
      });
      setCandidates(result.candidates);
      setAttributionUrl(result.attribution_url);
      setSelectedKeys(result.candidates.filter((item) => !item.duplicate).map((item) => item.key));
      if (!result.candidates.length) setMessage('Aucun commerce alimentaire exploitable trouvé pour cette wilaya dans OpenStreetMap.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant la recherche OpenStreetMap.');
    } finally {
      setSearching(false);
    }
  };

  const importSelected = async () => {
    if (!selectedWilaya || selectedItems.length === 0) return;
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch<{ inserted_count: number; duplicate_count: number }>('/api/discovery/osm/import', {
        method: 'POST',
        body: JSON.stringify({ wilaya_id: selectedWilaya.id, items: selectedItems }),
      });
      setMessage(result.inserted_count + ' magasins ajoutés à DistribDZ ; ' + result.duplicate_count + ' doublons ignorés.');
      setCandidates((prev) => prev.map((item) => selectedKeys.includes(item.key) ? { ...item, duplicate: true } : item));
      setSelectedKeys([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant l’importation.');
    } finally {
      setImporting(false);
    }
  };

  const toggleAll = () => {
    setSelectedKeys(selectedKeys.length === importable.length ? [] : importable.map((item) => item.key));
  };

  const toggleOne = (key: string) => {
    setSelectedKeys((prev) => prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]);
  };

  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Découverte des commerces — OpenStreetMap</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Recherche des commerces alimentaires dans la limite administrative de la wilaya.
              Les résultats sont prévisualisés avant toute insertion dans Neon.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 whitespace-nowrap">
            <MapPin className="w-3.5 h-3.5" /> Source OSM / ODbL
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
          <div>
            <label htmlFor="osm-wilaya" className="block text-xs font-semibold text-slate-700 mb-1.5">Wilaya à analyser</label>
            <select
              id="osm-wilaya"
              value={wilayaId}
              disabled={loadingWilayas || searching || importing}
              onChange={(e) => { setWilayaId(e.target.value); setCandidates([]); setSelectedKeys([]); setMessage(''); }}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {loadingWilayas && <option value="">Chargement…</option>}
              {wilayas.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </select>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button type="button" onClick={() => { const w = wilayas.find((x) => x.code === '25'); if (w) { setWilayaId(String(w.id)); setCandidates([]); setSelectedKeys([]); } }} className="text-[11px] px-2 py-1 border border-slate-200 rounded-md hover:bg-slate-50">Constantine</button>
              <button type="button" onClick={() => { const w = wilayas.find((x) => x.code === '41'); if (w) { setWilayaId(String(w.id)); setCandidates([]); setSelectedKeys([]); } }} className="text-[11px] px-2 py-1 border border-slate-200 rounded-md hover:bg-slate-50">Souk Ahras</button>
              <button type="button" onClick={() => { const w = wilayas.find((x) => x.code === '19'); if (w) { setWilayaId(String(w.id)); setCandidates([]); setSelectedKeys([]); } }} className="text-[11px] px-2 py-1 border border-slate-200 rounded-md hover:bg-slate-50">Sétif</button>
            </div>
          </div>
          <button
            type="button"
            onClick={runPreview}
            disabled={!wilayaId || searching || importing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50"
          >
            {searching ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searching ? 'Recherche OSM…' : 'Rechercher les commerces'}
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
          La collecte utilise les données OpenStreetMap (Overpass API). Les données importées restent attribuées à OpenStreetMap et sont distribuées sous licence ODbL.
          <a href={attributionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 ml-1 font-semibold text-emerald-800 hover:underline">Attribution et licence <ExternalLink className="w-3 h-3" /></a>
          <div className="mt-1 text-slate-500">Les résultats dépendent de la couverture cartographique OSM ; l'absence de résultat ne signifie pas l'absence de commerces sur le terrain.</div>
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{message}</div>}

      {candidates.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Prévisualisation — {selectedWilaya?.name}</h3>
              <p className="text-[11px] text-slate-500 mt-1">{candidates.length} résultats · {importable.length} nouveaux potentiels · {candidates.length - importable.length} doublons probables</p>
            </div>
            <button
              type="button"
              onClick={importSelected}
              disabled={selectedItems.length === 0 || importing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50"
            >
              {importing ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {importing ? 'Importation…' : 'Importer ' + selectedItems.length + ' sélectionnés'}
            </button>
          </div>
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <label className="inline-flex items-center gap-2 font-medium text-slate-700">
              <input type="checkbox" checked={importable.length > 0 && selectedKeys.length === importable.length} onChange={toggleAll} />
              Sélectionner tous les nouveaux résultats
            </label>
            <span className="text-slate-500">Les doublons probables sont exclus de l'importation</span>
          </div>
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 z-10">
                <tr>
                  <th className="p-3 w-9"></th><th className="p-3">Commerce</th><th className="p-3">Catégorie</th>
                  <th className="p-3">Adresse</th><th className="p-3">Téléphone</th><th className="p-3">Coordonnées</th><th className="p-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((item) => (
                  <tr key={item.key} className={item.duplicate ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-emerald-50/40'}>
                    <td className="p-3">
                      <input type="checkbox" disabled={item.duplicate} checked={selectedKeys.includes(item.key)} onChange={() => toggleOne(item.key)} aria-label={'Sélectionner ' + item.name} />
                    </td>
                    <td className="p-3"><div className="font-semibold text-slate-900">{item.name}</div>{item.duplicate && <span className="text-[10px] text-amber-700">Doublon probable</span>}</td>
                    <td className="p-3 whitespace-nowrap">{STORE_TYPE_LABELS[item.store_type] || item.store_type}</td>
                    <td className="p-3 max-w-[220px] whitespace-normal">{item.address || '—'}</td>
                    <td className="p-3 whitespace-nowrap">{item.phone || '—'}</td>
                    <td className="p-3 whitespace-nowrap font-mono text-[10px]">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</td>
                    <td className="p-3"><a href={item.osm_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-800 hover:underline">OSM <ExternalLink className="w-3 h-3" /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-slate-100 text-[10px] text-slate-500 flex items-center gap-2"><RefreshCw className="w-3 h-3" /> Les doublons sont recalculés côté serveur au moment de l'import pour éviter les insertions concurrentes.</div>
        </section>
      )}
    </div>
  );
};
