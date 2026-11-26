export type UserRole = 'admin' | 'producer';

export type StoreType =
  | 'superette'
  | 'mini_market'
  | 'epicerie'
  | 'magasin_gros'
  | 'hypermarche'
  | 'autre';

export type LeadStatus =
  | 'interesse'
  | 'contacte'
  | 'client'
  | 'non_interesse';

export interface Wilaya {
  id: number;
  code: string;
  name: string;
  name_ar: string;
  region: 'Est' | 'Centre' | 'Ouest' | 'Sud';
  latitude: number;
  longitude: number;
  is_active: boolean;
  priority_order: number;
  store_count?: number;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  company_name: string | null;
  sector: string | null;
  phone: string | null;
  preferred_wilaya_id: number | null;
  preferred_store_types: StoreType[];
  territory_wilaya_ids: number[];
  territory_names?: string[];
  is_active: boolean;
  created_at: string;
}

export interface Store {
  id: number;
  name: string;
  wilaya_id: number;
  wilaya_code: string;
  wilaya_name: string;
  commune: string;
  store_type: StoreType;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  review_count: number;
  opening_hours: string | null;
  google_maps_url: string | null;
  main_products: string | null;
  approx_surface_m2: number | null;
  clientele_type: string | null;
  photo_url: string | null;
  source: string;
  quality_score: number;
  distance_km?: number;
  lead_status?: LeadStatus | null;
  lead_notes?: string | null;
  updated_at: string;
  created_at: string;
}

export interface LeadHistoryEntry {
  id: number;
  lead_id: number;
  status: LeadStatus;
  note: string | null;
  created_at: string;
}

export interface LeadRecord {
  id: number;
  store_id: number;
  store_name: string;
  wilaya_name: string;
  wilaya_code: string;
  store_type: StoreType;
  phone: string | null;
  rating: number | null;
  status: LeadStatus;
  notes: string | null;
  updated_at: string;
  history: LeadHistoryEntry[];
}

export interface RecommendationItem {
  store: Store;
  match_score: number;
  reasons: string[];
}

export interface ScrapingJob {
  id: number;
  wilaya_ids: number[];
  wilaya_names: string[];
  categories: string[];
  status: 'termine' | 'en_cours' | 'erreur';
  found_count: number;
  inserted_count: number;
  duplicate_count: number;
  log_summary: string;
  created_at: string;
  completed_at: string | null;
}

export interface StatsResponse {
  total_stores: number;
  active_wilayas: number;
  total_wilayas: number;
  avg_rating: number;
  total_reviews: number;
  by_wilaya: Array<{
    wilaya_id: number;
    code: string;
    name: string;
    count: number;
    avg_rating: number;
    wholesale_count: number;
  }>;
  by_type: Array<{
    store_type: StoreType;
    count: number;
  }>;
  data_quality: {
    phone_pct: number;
    hours_pct: number;
    address_pct: number;
    enriched_pct: number;
    overall_pct: number;
  };
  recent_stores: Store[];
  lead_summary: {
    interesse: number;
    contacte: number;
    client: number;
    non_interesse: number;
    total: number;
  };
}
