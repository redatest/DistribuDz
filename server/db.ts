import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import { ALL_58_WILAYAS, INITIAL_STORES, STORE_PHOTO_BY_TYPE } from './seedData.ts';

const dbFile = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(process.cwd(), 'distribdz.db');

export const db = new DatabaseSync(dbFile);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function normalizeStoreKey(name: string, wilayaId: number): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return `${wilayaId}::${cleaned}`;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function computeQualityScore(row: {
  address?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  rating?: number | null;
  main_products?: string | null;
  approx_surface_m2?: number | null;
  clientele_type?: string | null;
}): number {
  let score = 20; // Base: nom + wilaya + GPS
  if (row.address && row.address.trim().length > 4) score += 15;
  if (row.phone && row.phone.trim().length > 6) score += 20;
  if (row.opening_hours && row.opening_hours.trim().length > 3) score += 15;
  if (row.rating !== null && row.rating !== undefined) score += 10;
  if (row.main_products && row.main_products.trim().length > 3) score += 10;
  if (row.approx_surface_m2 && row.approx_surface_m2 > 0) score += 5;
  if (row.clientele_type && row.clientele_type.trim().length > 2) score += 5;
  return Math.min(100, score);
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wilayas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      region TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      priority_order INTEGER NOT NULL DEFAULT 99,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'producer')),
      company_name TEXT,
      sector TEXT,
      phone TEXT,
      preferred_wilaya_id INTEGER REFERENCES wilayas(id) ON DELETE SET NULL,
      preferred_store_types TEXT NOT NULL DEFAULT '["superette","magasin_gros"]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_territories (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, wilaya_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_key TEXT NOT NULL UNIQUE,
      wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE RESTRICT,
      store_type TEXT NOT NULL CHECK(store_type IN ('superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche', 'autre')),
      address TEXT,
      phone TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      rating REAL,
      review_count INTEGER NOT NULL DEFAULT 0,
      opening_hours TEXT,
      google_maps_url TEXT,
      main_products TEXT,
      approx_surface_m2 INTEGER,
      clientele_type TEXT,
      photo_url TEXT,
      source TEXT NOT NULL DEFAULT 'Google Maps',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stores_wilaya ON stores(wilaya_id);
    CREATE INDEX IF NOT EXISTS idx_stores_type ON stores(store_type);
    CREATE INDEX IF NOT EXISTS idx_stores_rating ON stores(rating);

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('interesse', 'contacte', 'client', 'non_interesse')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, store_id)
    );

    CREATE TABLE IF NOT EXISTS lead_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scraping_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      wilaya_ids_json TEXT NOT NULL,
      categories_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('termine', 'en_cours', 'erreur')),
      found_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      log_summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
  `);

  // Safe migration for existing SQLite databases to allow 'mini_market'
  const storesSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'stores'")
    .get() as { sql: string } | undefined;
  if (storesSchema && !storesSchema.sql.includes("'mini_market'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;
      CREATE TABLE stores_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        normalized_key TEXT NOT NULL UNIQUE,
        wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE RESTRICT,
        store_type TEXT NOT NULL CHECK(store_type IN ('superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche', 'autre')),
        address TEXT,
        phone TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        rating REAL,
        review_count INTEGER NOT NULL DEFAULT 0,
        opening_hours TEXT,
        google_maps_url TEXT,
        main_products TEXT,
        approx_surface_m2 INTEGER,
        clientele_type TEXT,
        photo_url TEXT,
        source TEXT NOT NULL DEFAULT 'Google Maps',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO stores_migrated SELECT * FROM stores;
      DROP TABLE stores;
      ALTER TABLE stores_migrated RENAME TO stores;
      CREATE INDEX IF NOT EXISTS idx_stores_wilaya ON stores(wilaya_id);
      CREATE INDEX IF NOT EXISTS idx_stores_type ON stores(store_type);
      CREATE INDEX IF NOT EXISTS idx_stores_rating ON stores(rating);
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  // Seed all 58 Algerian wilayas once
  const wilayaCount = db.prepare('SELECT COUNT(*) as c FROM wilayas').get() as { c: number };
  if (wilayaCount.c === 0) {
    const insertWilaya = db.prepare(`
      INSERT INTO wilayas (code, name, name_ar, region, latitude, longitude, is_active, priority_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const w of ALL_58_WILAYAS) {
      insertWilaya.run(
        w.code,
        w.name,
        w.name_ar,
        w.region,
        w.latitude,
        w.longitude,
        w.is_active ? 1 : 0,
        w.priority_order
      );
    }
  }

  // Ensure verified baseline stores (including new real-world additions) are present idempotently
  const getWilayaByCode = db.prepare('SELECT id FROM wilayas WHERE code = ?');
  const checkKey = db.prepare('SELECT id FROM stores WHERE normalized_key = ?');
  const getCoordsByWilaya = db.prepare('SELECT latitude, longitude FROM stores WHERE wilaya_id = ?');
  const insertStore = db.prepare(`
    INSERT OR IGNORE INTO stores (
      name, normalized_key, wilaya_id, store_type, address, phone,
      latitude, longitude, rating, review_count, opening_hours, google_maps_url,
      main_products, approx_surface_m2, clientele_type, photo_url, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const coordsCache = new Map<number, Array<{ latitude: number; longitude: number }>>();

  for (const s of INITIAL_STORES) {
    const wilaya = getWilayaByCode.get(s.wilaya_code) as { id: number } | undefined;
    if (!wilaya) continue;
    const key = normalizeStoreKey(s.name, wilaya.id);
    if (checkKey.get(key)) continue;

    let existingCoords = coordsCache.get(wilaya.id);
    if (!existingCoords) {
      existingCoords = getCoordsByWilaya.all(wilaya.id) as Array<{
        latitude: number;
        longitude: number;
      }>;
      coordsCache.set(wilaya.id, existingCoords);
    }

    const nearExisting = existingCoords.some(
      (c) => haversineKm(s.latitude, s.longitude, c.latitude, c.longitude) < 0.05
    );
    if (nearExisting) continue;

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`;
    const photoUrl = STORE_PHOTO_BY_TYPE[s.store_type] || STORE_PHOTO_BY_TYPE.superette;
    insertStore.run(
      s.name,
      key,
      wilaya.id,
      s.store_type,
      s.address,
      s.phone,
      s.latitude,
      s.longitude,
      s.rating,
      s.review_count,
      s.opening_hours,
      mapsUrl,
      s.main_products,
      s.approx_surface_m2,
      s.clientele_type,
      photoUrl,
      s.source || 'Google Maps'
    );
    existingCoords.push({ latitude: s.latitude, longitude: s.longitude });
  }
}
