import React, { useEffect, useState } from 'react';
import { Crosshair, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { STORE_TYPE_COLORS, STORE_TYPE_LABELS } from '../lib/labels';
import type { Store, StoreType, Wilaya } from '../types';
import { StoreMap } from './StoreMap';

interface MapExplorerViewProps {
  onSelectStore: (storeId: number) => void;
}

export const MapExplorerView: React.FC<MapExplorerViewProps> = ({ onSelectStore }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [wilayaId, setWilayaId] = useState('');
  const [storeType, setStoreType] = useState('');
  const [centerLat, setCenterLat] = useState<number | null>(null);
  const [centerLng, setCenterLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(40);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ wilayas: Wilaya[] }>('/api/wilayas')
      .then((res) => setWilayas(res.wilayas))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (wilayaId) params.set('wilaya_id', wilayaId);
    if (storeType) params.set('store_type', storeType);
    if (centerLat !== null && centerLng !== null) {
      params.set('lat', String(centerLat));
      params.set('lng', String(centerLng));
      params.set('radius_km', String(radiusKm));
    }

    apiFetch<{ stores: Store[] }>(`/api/stores?${params.toString()}`)
      .then((res) => {
        if (active) setStores(res.stores);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [wilayaId, storeType, centerLat, centerLng, radiusKm]);

  const handleUseRadius = () => {
    const selectedW = wilayas.find((w) => String(w.id) === wilayaId) || wilayas[0];
    if (!navigator.geolocation) {
      if (selectedW) {
        setCenterLat(selectedW.latitude);
        setCenterLng(selectedW.longitude);
      }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenterLat(Number(pos.coords.latitude.toFixed(4)));
        setCenterLng(Number(pos.coords.longitude.toFixed(4)));
      },
      () => {
        if (selectedW) {
          setCenterLat(selectedW.latitude);
          setCenterLng(selectedW.longitude);
        }
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={wilayaId}
            onChange={(e) => setWilayaId(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Toutes les wilayas actives</option>
            {wilayas.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>

          <select
            value={storeType}
            onChange={(e) => setStoreType(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
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

          <button
            type="button"
            onClick={handleUseRadius}
            className="px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5"
          >
            <Crosshair className="w-3.5 h-3.5 text-emerald-700" />
            <span>Rayon de prospection</span>
          </button>

          {centerLat !== null && centerLng !== null && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="range"
                min={10}
                max={150}
                step={5}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="accent-emerald-700"
              />
              <span className="font-mono-tabular font-semibold">{radiusKm} km</span>
              <button
                type="button"
                onClick={() => {
                  setCenterLat(null);
                  setCenterLng(null);
                }}
                className="text-red-600 hover:underline flex items-center gap-0.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Effacer</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          {(
            ['superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche'] as StoreType[]
          ).map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: STORE_TYPE_COLORS[t] }}
              />
              <span>{STORE_TYPE_LABELS[t]}</span>
            </div>
          ))}
          <span className="font-mono-tabular font-semibold text-slate-900">
            {loading ? '...' : `${stores.length} points`}
          </span>
        </div>
      </div>

      <StoreMap
        stores={stores}
        onSelectStore={onSelectStore}
        heightClass="h-[600px]"
        centerLat={centerLat}
        centerLng={centerLng}
        radiusKm={centerLat !== null ? radiusKm : null}
      />
    </div>
  );
};
