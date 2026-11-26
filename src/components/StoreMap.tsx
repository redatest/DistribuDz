import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { Store, StoreType } from '../types';
import { STORE_TYPE_COLORS, STORE_TYPE_LABELS } from '../lib/labels';

interface StoreMapProps {
  stores: Store[];
  onSelectStore?: (storeId: number) => void;
  heightClass?: string;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
  singleStoreMode?: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const StoreMap: React.FC<StoreMapProps> = ({
  stores,
  onSelectStore,
  heightClass = 'h-[540px]',
  centerLat,
  centerLng,
  radiusKm,
  singleStoreMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const defaultCenter: [number, number] =
      centerLat && centerLng
        ? [centerLat, centerLng]
        : stores.length > 0
          ? [stores[0].latitude, stores[0].longitude]
          : [36.365, 6.6147];

    const map = L.map(containerRef.current, {
      center: defaultCenter,
      zoom: singleStoreMode ? 15 : 8,
      scrollWheelZoom: true,
    });

    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    if (centerLat && centerLng && radiusKm) {
      L.circle([centerLat, centerLng], {
        radius: radiusKm * 1000,
        color: '#047857',
        fillColor: '#10b981',
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: '5, 5',
      }).addTo(map);

      L.circleMarker([centerLat, centerLng], {
        radius: 7,
        color: '#0f172a',
        fillColor: '#10b981',
        fillOpacity: 1,
        weight: 2,
      })
        .bindPopup('<strong>Votre position de référence</strong>')
        .addTo(map);
    }

    const MarkerClusterCtor = (
      L as unknown as {
        markerClusterGroup: (opts?: Record<string, unknown>) => L.LayerGroup;
      }
    ).markerClusterGroup;

    const clusterLayer = singleStoreMode
      ? L.layerGroup()
      : MarkerClusterCtor({
          chunkedLoading: true,
          maxClusterRadius: 48,
        });

    const bounds: L.LatLngExpression[] = [];

    stores.forEach((store) => {
      const color = STORE_TYPE_COLORS[store.store_type as StoreType] || '#047857';
      const typeLabel = STORE_TYPE_LABELS[store.store_type as StoreType] || store.store_type;

      const markerIcon = L.divIcon({
        className: 'distribdz-custom-pin',
        html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2.5px solid #ffffff;box-shadow:0 1px 4px rgba(15,23,42,0.35);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker([store.latitude, store.longitude], { icon: markerIcon });

      const popupEl = document.createElement('div');
      popupEl.className = 'min-w-[220px] text-slate-800';
      popupEl.innerHTML = `
        <div style="font-weight:600;font-size:13px;color:#0f172a;margin-bottom:2px;">${escapeHtml(store.name)}</div>
        <div style="font-size:11px;color:#475569;margin-bottom:6px;">
          ${escapeHtml(store.wilaya_name)} (${escapeHtml(store.wilaya_code)}) · ${escapeHtml(typeLabel)}
        </div>
        <div style="font-size:11px;color:#334155;margin-bottom:4px;">
          ${store.rating !== null ? `Note Google : <strong>${store.rating}★</strong> (${store.review_count} avis)` : 'Note non renseignée'}
        </div>
        ${store.phone ? `<div style="font-size:11px;color:#047857;font-family:monospace;margin-bottom:6px;">${escapeHtml(store.phone)}</div>` : ''}
      `;

      if (onSelectStore && !singleStoreMode) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Voir la fiche complète';
        btn.style.cssText =
          'width:100%;padding:6px 10px;background:#047857;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;';
        btn.addEventListener('click', () => {
          onSelectStore(store.id);
        });
        popupEl.appendChild(btn);
      }

      marker.bindPopup(popupEl);
      clusterLayer.addLayer(marker);
      bounds.push([store.latitude, store.longitude]);
    });

    map.addLayer(clusterLayer);

    if (!singleStoreMode && bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 12 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], singleStoreMode ? 15 : 13);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [stores, onSelectStore, centerLat, centerLng, radiusKm, singleStoreMode]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass} rounded-lg border border-slate-200 bg-slate-100 overflow-hidden`}
    />
  );
};
