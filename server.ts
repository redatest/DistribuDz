import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  db,
  initDatabase,
  hashPassword,
  verifyPassword,
  normalizeStoreKey,
  haversineKm,
  computeQualityScore,
} from './server/db.ts';
import {
  SCRAPING_CATALOG_TEMPLATES,
  STORE_PHOTO_BY_TYPE,
  generateWilayaGridStores,
} from './server/seedData.ts';
import {
  buildTokenMatchers,
  discoverLiveOsmStores,
  extractStoreCommune,
  matchesTokenGroups,
} from './server/discovery.ts';

initDatabase();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const ALLOWED_STORE_TYPES = new Set([
  'superette',
  'mini_market',
  'epicerie',
  'magasin_gros',
  'hypermarche',
  'autre',
]);

const ALLOWED_LEAD_STATUSES = new Set([
  'interesse',
  'contacte',
  'client',
  'non_interesse',
]);

function sanitizeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: 'admin' | 'producer';
  company_name: string | null;
  sector: string | null;
  phone: string | null;
  preferred_wilaya_id: number | null;
  preferred_store_types: string[];
  territory_wilaya_ids: number[];
  territory_names: string[];
  is_active: boolean;
  created_at: string;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
  authToken?: string;
}

function loadUserWithTerritories(userId: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT id, email, full_name, role, company_name, sector, phone,
              preferred_wilaya_id, preferred_store_types, is_active, created_at
       FROM users WHERE id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const territories = db
    .prepare(
      `SELECT w.id, w.name
       FROM user_territories ut
       JOIN wilayas w ON w.id = ut.wilaya_id
       WHERE ut.user_id = ?
       ORDER BY w.priority_order ASC, w.code ASC`
    )
    .all(userId) as Array<{ id: number; name: string }>;

  let parsedTypes: string[] = ['superette', 'magasin_gros'];
  try {
    const p = JSON.parse(String(row.preferred_store_types || '[]'));
    if (Array.isArray(p)) parsedTypes = p.map(String);
  } catch {
    // keep default
  }

  return {
    id: Number(row.id),
    email: String(row.email),
    full_name: String(row.full_name),
    role: row.role === 'admin' ? 'admin' : 'producer',
    company_name: row.company_name ? String(row.company_name) : null,
    sector: row.sector ? String(row.sector) : null,
    phone: row.phone ? String(row.phone) : null,
    preferred_wilaya_id: row.preferred_wilaya_id ? Number(row.preferred_wilaya_id) : null,
    preferred_store_types: parsedTypes,
    territory_wilaya_ids: territories.map((t) => Number(t.id)),
    territory_names: territories.map((t) => t.name),
    is_active: Number(row.is_active) === 1,
    created_at: String(row.created_at),
  };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }

  const token = header.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Jeton invalide.' });
    return;
  }

  const session = db
    .prepare(
      `SELECT user_id, expires_at FROM sessions WHERE token = ?`
    )
    .get(token) as { user_id: number; expires_at: string } | undefined;

  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    if (session) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
    return;
  }

  const user = loadUserWithTerritories(session.user_id);
  if (!user || !user.is_active) {
    res.status(403).json({ error: 'Compte désactivé ou introuvable.' });
    return;
  }

  req.user = user;
  req.authToken = token;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
    return;
  }
  next();
}

function createSessionToken(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
  return token;
}

function serializeStoreRow(
  row: Record<string, unknown>,
  userId?: number,
  userLat?: number | null,
  userLng?: number | null
) {
  let leadStatus: string | null = null;
  let leadNotes: string | null = null;
  if (userId) {
    const lead = db
      .prepare('SELECT status, notes FROM leads WHERE user_id = ? AND store_id = ?')
      .get(userId, Number(row.id)) as { status: string; notes: string | null } | undefined;
    if (lead) {
      leadStatus = lead.status;
      leadNotes = lead.notes;
    }
  }

  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  const distanceKm =
    userLat !== null &&
    userLat !== undefined &&
    userLng !== null &&
    userLng !== undefined &&
    Number.isFinite(userLat) &&
    Number.isFinite(userLng)
      ? haversineKm(userLat, userLng, lat, lng)
      : undefined;

  const addressStr = row.address ? String(row.address) : null;
  const wilayaNameStr = String(row.wilaya_name);
  const commune = extractStoreCommune(addressStr, String(row.name), wilayaNameStr);

  return {
    id: Number(row.id),
    name: String(row.name),
    wilaya_id: Number(row.wilaya_id),
    wilaya_code: String(row.wilaya_code),
    wilaya_name: wilayaNameStr,
    commune,
    store_type: String(row.store_type),
    address: addressStr,
    phone: row.phone ? String(row.phone) : null,
    latitude: lat,
    longitude: lng,
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
    review_count: Number(row.review_count || 0),
    opening_hours: row.opening_hours ? String(row.opening_hours) : null,
    google_maps_url: row.google_maps_url ? String(row.google_maps_url) : null,
    main_products: row.main_products ? String(row.main_products) : null,
    approx_surface_m2:
      row.approx_surface_m2 !== null && row.approx_surface_m2 !== undefined
        ? Number(row.approx_surface_m2)
        : null,
    clientele_type: row.clientele_type ? String(row.clientele_type) : null,
    photo_url: row.photo_url
      ? String(row.photo_url)
      : STORE_PHOTO_BY_TYPE[String(row.store_type)] || STORE_PHOTO_BY_TYPE.superette,
    source: String(row.source || 'Google Maps'),
    quality_score: computeQualityScore({
      address: row.address ? String(row.address) : null,
      phone: row.phone ? String(row.phone) : null,
      opening_hours: row.opening_hours ? String(row.opening_hours) : null,
      rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
      main_products: row.main_products ? String(row.main_products) : null,
      approx_surface_m2:
        row.approx_surface_m2 !== null && row.approx_surface_m2 !== undefined
          ? Number(row.approx_surface_m2)
          : null,
      clientele_type: row.clientele_type ? String(row.clientele_type) : null,
    }),
    distance_km: distanceKm,
    lead_status: leadStatus,
    lead_notes: leadNotes,
    updated_at: String(row.updated_at),
    created_at: String(row.created_at),
  };
}

// =========================================================================
// AUTHENTICATION ENDPOINTS
// =========================================================================

app.get('/api/auth/status', (_req: Request, res: Response) => {
  const adminCount = db
    .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'")
    .get() as { c: number };
  res.json({
    has_admin: adminCount.c > 0,
    env_passcode_configured: Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim()),
  });
});

app.post('/api/auth/bootstrap-admin', (req: Request, res: Response) => {
  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { id: number } | undefined;

  if (existingAdmin) {
    res.status(409).json({
      error: 'Un compte administrateur est déjà configuré. Utilisez la connexion.',
    });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !email.includes('@') || !fullName || password.length < 6) {
    res.status(400).json({
      error: 'Email valide, nom complet et mot de passe (min. 6 caractères) requis.',
    });
    return;
  }

  const emailTaken = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (emailTaken) {
    res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, full_name, role, company_name, sector)
       VALUES (?, ?, ?, 'admin', 'DistribDZ Administration', 'Administration Plateforme')`
    )
    .run(email, passwordHash, fullName);

  const userId = Number(info.lastInsertRowid);
  const token = createSessionToken(userId);
  const user = loadUserWithTerritories(userId);

  res.status(201).json({ token, user });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const companyName =
    typeof req.body?.company_name === 'string' ? req.body.company_name.trim() : null;
  const sector = typeof req.body?.sector === 'string' ? req.body.sector.trim() : null;
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : null;
  const preferredWilayaId = req.body?.preferred_wilaya_id
    ? Number(req.body.preferred_wilaya_id)
    : null;

  const rawTypes = Array.isArray(req.body?.preferred_store_types)
    ? req.body.preferred_store_types.filter((t: unknown) => ALLOWED_STORE_TYPES.has(String(t)))
    : ['superette', 'magasin_gros'];

  if (!email || !email.includes('@') || !fullName || password.length < 6) {
    res.status(400).json({
      error: 'Email valide, nom complet et mot de passe (6 caractères min.) requis.',
    });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO users (
        email, password_hash, full_name, role, company_name, sector, phone,
        preferred_wilaya_id, preferred_store_types
      ) VALUES (?, ?, ?, 'producer', ?, ?, ?, ?, ?)`
    )
    .run(
      email,
      passwordHash,
      fullName,
      companyName || 'Entreprise Productrice',
      sector || 'Agroalimentaire & FMCG',
      phone,
      preferredWilayaId,
      JSON.stringify(rawTypes.length > 0 ? rawTypes : ['superette', 'magasin_gros'])
    );

  const userId = Number(info.lastInsertRowid);
  if (preferredWilayaId) {
    db.prepare('INSERT OR IGNORE INTO user_territories (user_id, wilaya_id) VALUES (?, ?)').run(
      userId,
      preferredWilayaId
    );
  }

  const token = createSessionToken(userId);
  const user = loadUserWithTerritories(userId);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis.' });
    return;
  }

  const row = db
    .prepare('SELECT id, password_hash, role, is_active FROM users WHERE email = ?')
    .get(email) as
    | { id: number; password_hash: string; role: string; is_active: number }
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Identifiants incorrects.' });
    return;
  }

  if (row.is_active !== 1) {
    res.status(403).json({ error: 'Votre compte a été désactivé par un administrateur.' });
    return;
  }

  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const isEnvAdminOverride =
    row.role === 'admin' && Boolean(envPasscode) && password === envPasscode;

  if (!isEnvAdminOverride && !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Identifiants incorrects.' });
    return;
  }

  const token = createSessionToken(row.id);
  const user = loadUserWithTerritories(row.id);
  res.json({ token, user });
});

app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res: Response) => {
  if (req.authToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.authToken);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
  res.json({ user: req.user });
});

app.put('/api/auth/profile', requireAuth, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const fullName =
    typeof req.body?.full_name === 'string' && req.body.full_name.trim()
      ? req.body.full_name.trim()
      : user.full_name;
  const companyName =
    typeof req.body?.company_name === 'string' ? req.body.company_name.trim() : user.company_name;
  const sector = typeof req.body?.sector === 'string' ? req.body.sector.trim() : user.sector;
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : user.phone;
  const preferredWilayaId =
    req.body?.preferred_wilaya_id !== undefined
      ? req.body.preferred_wilaya_id
        ? Number(req.body.preferred_wilaya_id)
        : null
      : user.preferred_wilaya_id;

  const preferredTypes = Array.isArray(req.body?.preferred_store_types)
    ? req.body.preferred_store_types.filter((t: unknown) => ALLOWED_STORE_TYPES.has(String(t)))
    : user.preferred_store_types;

  db.prepare(
    `UPDATE users
     SET full_name = ?, company_name = ?, sector = ?, phone = ?,
         preferred_wilaya_id = ?, preferred_store_types = ?
     WHERE id = ?`
  ).run(
    fullName,
    companyName,
    sector,
    phone,
    preferredWilayaId,
    JSON.stringify(preferredTypes.length > 0 ? preferredTypes : ['superette']),
    user.id
  );

  if (typeof req.body?.new_password === 'string' && req.body.new_password.length > 0) {
    if (req.body.new_password.length < 6) {
      res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères.' });
      return;
    }
    const currentRow = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(user.id) as { password_hash: string };
    const currentPass = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    if (!verifyPassword(currentPass, currentRow.password_hash)) {
      res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(req.body.new_password),
      user.id
    );
  }

  res.json({ user: loadUserWithTerritories(user.id) });
});

// =========================================================================
// WILAYAS ENDPOINTS (SCALABLE 58 WILAYAS)
// =========================================================================

app.get('/api/wilayas', (req: Request, res: Response) => {
  const showAll = req.query.all === '1' || req.query.all === 'true';
  const rows = db
    .prepare(
      `SELECT w.*, COUNT(s.id) as store_count
       FROM wilayas w
       LEFT JOIN stores s ON s.wilaya_id = w.id
       ${showAll ? '' : 'WHERE w.is_active = 1'}
       GROUP BY w.id
       ORDER BY w.is_active DESC, w.priority_order ASC, w.code ASC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    wilayas: rows.map((w) => ({
      id: Number(w.id),
      code: String(w.code),
      name: String(w.name),
      name_ar: String(w.name_ar),
      region: String(w.region),
      latitude: Number(w.latitude),
      longitude: Number(w.longitude),
      is_active: Number(w.is_active) === 1,
      priority_order: Number(w.priority_order),
      store_count: Number(w.store_count || 0),
    })),
  });
});

app.patch('/api/wilayas/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, is_active, priority_order FROM wilayas WHERE id = ?').get(id) as
    | { id: number; is_active: number; priority_order: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Wilaya introuvable.' });
    return;
  }

  const nextActive =
    req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;
  const nextPriority =
    req.body?.priority_order !== undefined ? Number(req.body.priority_order) : existing.priority_order;

  db.prepare('UPDATE wilayas SET is_active = ?, priority_order = ? WHERE id = ?').run(
    nextActive,
    nextPriority,
    id
  );

  const updated = db
    .prepare(
      `SELECT w.*, COUNT(s.id) as store_count
       FROM wilayas w LEFT JOIN stores s ON s.wilaya_id = w.id
       WHERE w.id = ? GROUP BY w.id`
    )
    .get(id) as Record<string, unknown>;

  res.json({
    wilaya: {
      ...updated,
      is_active: Number(updated.is_active) === 1,
      store_count: Number(updated.store_count || 0),
    },
  });
});

// =========================================================================
// STORES & GEOLOCATION & MATCHING ENDPOINTS
// =========================================================================

app.get('/api/stores', requireAuth, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const wilayaId = req.query.wilaya_id ? Number(req.query.wilaya_id) : null;
  const storeType = typeof req.query.store_type === 'string' ? req.query.store_type : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const minRating = req.query.min_rating ? Number(req.query.min_rating) : null;
  const hasPhone = req.query.has_phone === '1' || req.query.has_phone === 'true';
  const territoryOnly = req.query.territory_only === '1' || req.query.territory_only === 'true';
  const userLat = req.query.lat ? Number(req.query.lat) : null;
  const userLng = req.query.lng ? Number(req.query.lng) : null;
  const radiusKm = req.query.radius_km ? Number(req.query.radius_km) : null;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'rating';
  const communeFilter = typeof req.query.commune === 'string' ? req.query.commune.trim() : '';

  const clauses: string[] = ['w.is_active = 1'];
  const params: Array<string | number> = [];

  if (wilayaId && Number.isFinite(wilayaId)) {
    clauses.push('s.wilaya_id = ?');
    params.push(wilayaId);
  }
  if (storeType && ALLOWED_STORE_TYPES.has(storeType)) {
    clauses.push('s.store_type = ?');
    params.push(storeType);
  }
  if (minRating !== null && Number.isFinite(minRating)) {
    clauses.push('COALESCE(s.rating, 0) >= ?');
    params.push(minRating);
  }
  if (hasPhone) {
    clauses.push("s.phone IS NOT NULL AND TRIM(s.phone) != ''");
  }
  if (territoryOnly && user.territory_wilaya_ids.length > 0) {
    const placeholders = user.territory_wilaya_ids.map(() => '?').join(',');
    clauses.push(`s.wilaya_id IN (${placeholders})`);
    params.push(...user.territory_wilaya_ids);
  }

  const rows = db
    .prepare(
      `SELECT s.*, w.code as wilaya_code, w.name as wilaya_name, w.name_ar as wilaya_name_ar
       FROM stores s
       JOIN wilayas w ON w.id = s.wilaya_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.updated_at DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  const tokenGroups = q ? buildTokenMatchers(q) : [];

  const filteredRows =
    tokenGroups.length > 0
      ? rows.filter((row) =>
          matchesTokenGroups(tokenGroups, [
            String(row.name || ''),
            row.address ? String(row.address) : '',
            row.main_products ? String(row.main_products) : '',
            String(row.wilaya_name || ''),
            String(row.wilaya_name_ar || ''),
            String(row.store_type || ''),
          ])
        )
      : rows;

  let stores = filteredRows.map((row) => serializeStoreRow(row, user.id, userLat, userLng));

  if (
    radiusKm !== null &&
    Number.isFinite(radiusKm) &&
    userLat !== null &&
    userLng !== null &&
    Number.isFinite(userLat) &&
    Number.isFinite(userLng)
  ) {
    stores = stores.filter((s) => s.distance_km !== undefined && s.distance_km <= radiusKm);
  }

  // Résumé des communes disponibles avant filtrage spécifique par commune
  const communeCounts = new Map<string, number>();
  for (const s of stores) {
    communeCounts.set(s.commune, (communeCounts.get(s.commune) || 0) + 1);
  }
  const communes = Array.from(communeCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));

  if (communeFilter) {
    const normFilter = communeFilter.toLowerCase();
    stores = stores.filter((s) => s.commune.toLowerCase() === normFilter);
  }

  stores.sort((a, b) => {
    if (sort === 'distance' && a.distance_km !== undefined && b.distance_km !== undefined) {
      return a.distance_km - b.distance_km;
    }
    if (sort === 'reviews') return b.review_count - a.review_count;
    if (sort === 'quality') return b.quality_score - a.quality_score;
    if (sort === 'recent') return b.updated_at.localeCompare(a.updated_at);
    return (b.rating || 0) - (a.rating || 0) || b.review_count - a.review_count;
  });

  res.json({ total: stores.length, stores, communes });
});

app.post('/api/stores/live-discover', requireAuth, async (req: AuthedRequest, res: Response) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const wilayaId = req.body?.wilaya_id ? Number(req.body.wilaya_id) : null;

  if (!query || query.length < 2) {
    res.status(400).json({ error: 'Veuillez saisir un mot-clé de recherche (min. 2 caractères).' });
    return;
  }

  const allWilayas = db
    .prepare('SELECT id, code, name, name_ar, latitude, longitude FROM wilayas')
    .all() as Array<{
    id: number;
    code: string;
    name: string;
    name_ar: string;
    latitude: number;
    longitude: number;
  }>;

  const targetWilaya = wilayaId ? allWilayas.find((w) => w.id === wilayaId) || null : null;

  const candidates = await discoverLiveOsmStores({
    query,
    wilaya: targetWilaya,
    includeOverpass: Boolean(targetWilaya),
  });

  const insertStore = db.prepare(`
    INSERT INTO stores (
      name, normalized_key, wilaya_id, store_type, address, phone,
      latitude, longitude, rating, review_count, opening_hours, google_maps_url,
      main_products, approx_surface_m2, clientele_type, photo_url, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedCount = 0;

  for (const c of candidates) {
    let assignedWilaya = targetWilaya;
    if (!assignedWilaya && allWilayas.length > 0) {
      let bestDist = Infinity;
      for (const w of allWilayas) {
        const d = haversineKm(c.latitude, c.longitude, w.latitude, w.longitude);
        if (d < bestDist) {
          bestDist = d;
          assignedWilaya = w;
        }
      }
    }
    if (!assignedWilaya) continue;

    db.prepare('UPDATE wilayas SET is_active = 1 WHERE id = ?').run(assignedWilaya.id);

    const key = normalizeStoreKey(c.name, assignedWilaya.id);
    const dupName = db.prepare('SELECT id FROM stores WHERE normalized_key = ?').get(key);
    if (dupName) continue;

    const sameWilayaExisting = db
      .prepare('SELECT latitude, longitude FROM stores WHERE wilaya_id = ?')
      .all(assignedWilaya.id) as Array<{ latitude: number; longitude: number }>;

    const dupGps = sameWilayaExisting.some(
      (ex) => haversineKm(c.latitude, c.longitude, ex.latitude, ex.longitude) < 0.05
    );
    if (dupGps) continue;

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`;
    const photoUrl = STORE_PHOTO_BY_TYPE[c.store_type] || STORE_PHOTO_BY_TYPE.superette;
    insertStore.run(
      c.name,
      key,
      assignedWilaya.id,
      c.store_type,
      c.address,
      c.phone,
      c.latitude,
      c.longitude,
      c.rating,
      c.review_count,
      c.opening_hours,
      mapsUrl,
      c.main_products,
      c.approx_surface_m2,
      c.clientele_type,
      photoUrl,
      c.source
    );
    insertedCount += 1;
  }

  res.json({
    discovered_count: candidates.length,
    inserted_count: insertedCount,
  });
});

app.get('/api/stores/nearby', requireAuth, (req: AuthedRequest, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = req.query.radius_km ? Number(req.query.radius_km) : 50;
  const limit = Math.min(100, req.query.limit ? Number(req.query.limit) : 25);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'Paramètres lat et lng valides requis.' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT s.*, w.code as wilaya_code, w.name as wilaya_name
       FROM stores s
       JOIN wilayas w ON w.id = s.wilaya_id
       WHERE w.is_active = 1`
    )
    .all() as Array<Record<string, unknown>>;

  const nearby = rows
    .map((row) => serializeStoreRow(row, req.user!.id, lat, lng))
    .filter((s) => s.distance_km !== undefined && s.distance_km <= radiusKm)
    .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0))
    .slice(0, limit);

  res.json({ total: nearby.length, stores: nearby });
});

app.get('/api/stores/recommendations', requireAuth, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const rows = db
    .prepare(
      `SELECT s.*, w.code as wilaya_code, w.name as wilaya_name
       FROM stores s
       JOIN wilayas w ON w.id = s.wilaya_id
       WHERE w.is_active = 1`
    )
    .all() as Array<Record<string, unknown>>;

  const targetWilayas = new Set<number>([
    ...user.territory_wilaya_ids,
    ...(user.preferred_wilaya_id ? [user.preferred_wilaya_id] : []),
  ]);
  const preferredTypes = new Set<string>(user.preferred_store_types || []);
  const sectorTokens = (user.sector || '')
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .filter((t) => t.length >= 4);

  const recommendations = rows
    .map((row) => {
      const store = serializeStoreRow(row, user.id);
      let score = 0;
      const reasons: string[] = [];

      if (targetWilayas.has(store.wilaya_id)) {
        score += 35;
        reasons.push(`Dans votre territoire (${store.wilaya_name})`);
      } else if (targetWilayas.size === 0) {
        score += 18;
      }

      if (preferredTypes.has(store.store_type)) {
        score += 25;
        reasons.push('Format de magasin ciblé');
      } else if (store.store_type === 'magasin_gros') {
        score += 15;
        reasons.push('Volume grossiste B2B');
      }

      const prodLower = (store.main_products || '').toLowerCase();
      if (sectorTokens.some((tok) => prodLower.includes(tok))) {
        score += 15;
        reasons.push('Rayons compatibles avec votre secteur');
      } else if (store.main_products) {
        score += 7;
      }

      if ((store.rating || 0) >= 4.5 && store.review_count >= 40) {
        score += 15;
        reasons.push(`Forte notoriété (${store.rating}★ · ${store.review_count} avis)`);
      } else if ((store.rating || 0) >= 4.0) {
        score += 9;
      }

      if (store.phone && store.quality_score >= 80) {
        score += 10;
        reasons.push('Contact téléphonique vérifié');
      } else if (store.phone) {
        score += 5;
      }

      if (store.lead_status === 'non_interesse') {
        score = Math.max(0, score - 40);
      }

      return {
        store,
        match_score: Math.min(99, score),
        reasons: reasons.slice(0, 3),
      };
    })
    .sort((a, b) => b.match_score - a.match_score || (b.store.rating || 0) - (a.store.rating || 0))
    .slice(0, 12);

  res.json({ recommendations });
});

app.get('/api/stores/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(
      `SELECT s.*, w.code as wilaya_code, w.name as wilaya_name
       FROM stores s
       JOIN wilayas w ON w.id = s.wilaya_id
       WHERE s.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Magasin introuvable.' });
    return;
  }

  const store = serializeStoreRow(row, req.user!.id);
  const lead = db
    .prepare('SELECT id, status, notes, updated_at FROM leads WHERE user_id = ? AND store_id = ?')
    .get(req.user!.id, id) as
    | { id: number; status: string; notes: string | null; updated_at: string }
    | undefined;

  const history = lead
    ? (db
        .prepare(
          'SELECT id, lead_id, status, note, created_at FROM lead_history WHERE lead_id = ? ORDER BY created_at DESC'
        )
        .all(lead.id) as Array<Record<string, unknown>>)
    : [];

  res.json({ store, lead: lead || null, history });
});

app.post('/api/stores', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const wilayaId = Number(req.body?.wilaya_id);
  const storeType = String(req.body?.store_type || '');
  const lat = Number(req.body?.latitude);
  const lng = Number(req.body?.longitude);

  if (!name || !Number.isFinite(wilayaId) || !ALLOWED_STORE_TYPES.has(storeType)) {
    res.status(400).json({ error: 'Nom, wilaya et type de magasin valides requis.' });
    return;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'Coordonnées GPS (latitude, longitude) requises.' });
    return;
  }

  const normalizedKey = normalizeStoreKey(name, wilayaId);
  const duplicateByName = db
    .prepare('SELECT id, name FROM stores WHERE normalized_key = ?')
    .get(normalizedKey) as { id: number; name: string } | undefined;

  if (duplicateByName) {
    res.status(409).json({
      error: `Doublon détecté : "${duplicateByName.name}" existe déjà dans cette wilaya.`,
    });
    return;
  }

  const sameWilayaStores = db
    .prepare('SELECT id, name, latitude, longitude FROM stores WHERE wilaya_id = ?')
    .all(wilayaId) as Array<{ id: number; name: string; latitude: number; longitude: number }>;

  for (const other of sameWilayaStores) {
    if (haversineKm(lat, lng, other.latitude, other.longitude) < 0.05) {
      res.status(409).json({
        error: `Doublon GPS détecté à moins de 50m : "${other.name}".`,
      });
      return;
    }
  }

  const mapsUrl =
    sanitizeExternalUrl(req.body?.google_maps_url) ||
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const photoUrl = STORE_PHOTO_BY_TYPE[storeType] || STORE_PHOTO_BY_TYPE.superette;

  const info = db
    .prepare(
      `INSERT INTO stores (
        name, normalized_key, wilaya_id, store_type, address, phone,
        latitude, longitude, rating, review_count, opening_hours, google_maps_url,
        main_products, approx_surface_m2, clientele_type, photo_url, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      normalizedKey,
      wilayaId,
      storeType,
      typeof req.body?.address === 'string' ? req.body.address.trim() || null : null,
      typeof req.body?.phone === 'string' ? req.body.phone.trim() || null : null,
      lat,
      lng,
      req.body?.rating !== undefined && req.body.rating !== '' && req.body.rating !== null
        ? Number(req.body.rating)
        : null,
      Number(req.body?.review_count || 0),
      typeof req.body?.opening_hours === 'string' ? req.body.opening_hours.trim() || null : null,
      mapsUrl,
      typeof req.body?.main_products === 'string' ? req.body.main_products.trim() || null : null,
      req.body?.approx_surface_m2 ? Number(req.body.approx_surface_m2) : null,
      typeof req.body?.clientele_type === 'string' ? req.body.clientele_type.trim() || null : null,
      photoUrl,
      'Saisie Manuelle Admin'
    );

  const created = db
    .prepare(
      `SELECT s.*, w.code as wilaya_code, w.name as wilaya_name
       FROM stores s JOIN wilayas w ON w.id = s.wilaya_id WHERE s.id = ?`
    )
    .get(Number(info.lastInsertRowid)) as Record<string, unknown>;

  res.status(201).json({ store: serializeStoreRow(created, req.user!.id) });
});

app.put('/api/stores/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Magasin introuvable.' });
    return;
  }

  const name =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : String(existing.name);
  const wilayaId = req.body?.wilaya_id ? Number(req.body.wilaya_id) : Number(existing.wilaya_id);
  const storeType =
    req.body?.store_type && ALLOWED_STORE_TYPES.has(String(req.body.store_type))
      ? String(req.body.store_type)
      : String(existing.store_type);
  const lat = req.body?.latitude !== undefined ? Number(req.body.latitude) : Number(existing.latitude);
  const lng = req.body?.longitude !== undefined ? Number(req.body.longitude) : Number(existing.longitude);

  const normalizedKey = normalizeStoreKey(name, wilayaId);
  const duplicate = db
    .prepare('SELECT id FROM stores WHERE normalized_key = ? AND id != ?')
    .get(normalizedKey, id);
  if (duplicate) {
    res.status(409).json({ error: 'Un autre magasin porte déjà ce nom dans cette wilaya.' });
    return;
  }

  const mapsUrl =
    sanitizeExternalUrl(req.body?.google_maps_url) ||
    (existing.google_maps_url ? String(existing.google_maps_url) : null);

  const existingStr = (v: unknown) => (v !== null && v !== undefined ? String(v) : null);
  const existingNum = (v: unknown) => (v !== null && v !== undefined ? Number(v) : null);

  db.prepare(
    `UPDATE stores
     SET name = ?, normalized_key = ?, wilaya_id = ?, store_type = ?, address = ?, phone = ?,
         latitude = ?, longitude = ?, rating = ?, review_count = ?, opening_hours = ?,
         google_maps_url = ?, main_products = ?, approx_surface_m2 = ?, clientele_type = ?,
         photo_url = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name,
    normalizedKey,
    wilayaId,
    storeType,
    req.body?.address !== undefined
      ? String(req.body.address || '').trim() || null
      : existingStr(existing.address),
    req.body?.phone !== undefined
      ? String(req.body.phone || '').trim() || null
      : existingStr(existing.phone),
    lat,
    lng,
    req.body?.rating !== undefined
      ? req.body.rating !== '' && req.body.rating !== null
        ? Number(req.body.rating)
        : null
      : existingNum(existing.rating),
    req.body?.review_count !== undefined
      ? Number(req.body.review_count || 0)
      : Number(existing.review_count || 0),
    req.body?.opening_hours !== undefined
      ? String(req.body.opening_hours || '').trim() || null
      : existingStr(existing.opening_hours),
    mapsUrl,
    req.body?.main_products !== undefined
      ? String(req.body.main_products || '').trim() || null
      : existingStr(existing.main_products),
    req.body?.approx_surface_m2 !== undefined
      ? req.body.approx_surface_m2
        ? Number(req.body.approx_surface_m2)
        : null
      : existingNum(existing.approx_surface_m2),
    req.body?.clientele_type !== undefined
      ? String(req.body.clientele_type || '').trim() || null
      : existingStr(existing.clientele_type),
    STORE_PHOTO_BY_TYPE[storeType] || String(existing.photo_url || STORE_PHOTO_BY_TYPE.superette),
    id
  );

  const updated = db
    .prepare(
      `SELECT s.*, w.code as wilaya_code, w.name as wilaya_name
       FROM stores s JOIN wilayas w ON w.id = s.wilaya_id WHERE s.id = ?`
    )
    .get(id) as Record<string, unknown>;

  res.json({ store: serializeStoreRow(updated, req.user!.id) });
});

app.delete('/api/stores/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM stores WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Magasin introuvable.' });
    return;
  }
  res.json({ ok: true });
});

// =========================================================================
// LEADS / CRM SYSTEM ENDPOINTS
// =========================================================================

app.get('/api/leads', requireAuth, (req: AuthedRequest, res: Response) => {
  const userId = req.user!.id;
  const rows = db
    .prepare(
      `SELECT l.*, s.name as store_name, s.store_type, s.phone, s.rating,
              w.name as wilaya_name, w.code as wilaya_code
       FROM leads l
       JOIN stores s ON s.id = l.store_id
       JOIN wilayas w ON w.id = s.wilaya_id
       WHERE l.user_id = ?
       ORDER BY l.updated_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  const leads = rows.map((row) => {
    const history = db
      .prepare(
        'SELECT id, lead_id, status, note, created_at FROM lead_history WHERE lead_id = ? ORDER BY created_at DESC'
      )
      .all(Number(row.id)) as Array<Record<string, unknown>>;

    return {
      id: Number(row.id),
      store_id: Number(row.store_id),
      store_name: String(row.store_name),
      wilaya_name: String(row.wilaya_name),
      wilaya_code: String(row.wilaya_code),
      store_type: String(row.store_type),
      phone: row.phone ? String(row.phone) : null,
      rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
      status: String(row.status),
      notes: row.notes ? String(row.notes) : null,
      updated_at: String(row.updated_at),
      history,
    };
  });

  res.json({ leads });
});

app.put('/api/stores/:id/lead', requireAuth, (req: AuthedRequest, res: Response) => {
  const storeId = Number(req.params.id);
  const userId = req.user!.id;
  const status = String(req.body?.status || '');
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : null;

  if (!ALLOWED_LEAD_STATUSES.has(status)) {
    res.status(400).json({ error: 'Statut de lead invalide.' });
    return;
  }

  const storeExists = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId);
  if (!storeExists) {
    res.status(404).json({ error: 'Magasin introuvable.' });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM leads WHERE user_id = ? AND store_id = ?')
    .get(userId, storeId) as { id: number } | undefined;

  let leadId: number;
  if (existing) {
    leadId = existing.id;
    db.prepare(
      "UPDATE leads SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, notes, leadId);
  } else {
    const info = db
      .prepare('INSERT INTO leads (user_id, store_id, status, notes) VALUES (?, ?, ?, ?)')
      .run(userId, storeId, status, notes);
    leadId = Number(info.lastInsertRowid);
  }

  db.prepare(
    'INSERT INTO lead_history (lead_id, user_id, status, note) VALUES (?, ?, ?, ?)'
  ).run(leadId, userId, status, notes);

  const history = db
    .prepare(
      'SELECT id, lead_id, status, note, created_at FROM lead_history WHERE lead_id = ? ORDER BY created_at DESC'
    )
    .all(leadId);

  res.json({
    lead: { id: leadId, store_id: storeId, status, notes },
    history,
  });
});

// =========================================================================
// STATISTICS & DATA QUALITY ENDPOINT
// =========================================================================

app.get('/api/stats', requireAuth, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const totalWilayas = (db.prepare('SELECT COUNT(*) as c FROM wilayas').get() as { c: number }).c;
  const activeWilayas = (
    db.prepare('SELECT COUNT(*) as c FROM wilayas WHERE is_active = 1').get() as { c: number }
  ).c;

  const storeRows = db
    .prepare(
      `SELECT s.*, w.code as wilaya_code, w.name as wilaya_name
       FROM stores s JOIN wilayas w ON w.id = s.wilaya_id
       WHERE w.is_active = 1
       ORDER BY s.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const totalStores = storeRows.length;
  let ratingSum = 0;
  let ratingCount = 0;
  let totalReviews = 0;
  let withPhone = 0;
  let withHours = 0;
  let withAddress = 0;
  let withEnriched = 0;

  for (const s of storeRows) {
    if (s.rating !== null && s.rating !== undefined) {
      ratingSum += Number(s.rating);
      ratingCount += 1;
    }
    totalReviews += Number(s.review_count || 0);
    if (s.phone && String(s.phone).trim()) withPhone += 1;
    if (s.opening_hours && String(s.opening_hours).trim()) withHours += 1;
    if (s.address && String(s.address).trim()) withAddress += 1;
    if (s.main_products && s.approx_surface_m2) withEnriched += 1;
  }

  const pct = (n: number) => (totalStores > 0 ? Math.round((n / totalStores) * 100) : 0);
  const phonePct = pct(withPhone);
  const hoursPct = pct(withHours);
  const addressPct = pct(withAddress);
  const enrichedPct = pct(withEnriched);

  const byWilaya = db
    .prepare(
      `SELECT w.id as wilaya_id, w.code, w.name,
              COUNT(s.id) as count,
              ROUND(AVG(s.rating), 2) as avg_rating,
              SUM(CASE WHEN s.store_type = 'magasin_gros' THEN 1 ELSE 0 END) as wholesale_count
       FROM wilayas w
       LEFT JOIN stores s ON s.wilaya_id = w.id
       WHERE w.is_active = 1
       GROUP BY w.id
       ORDER BY count DESC, w.priority_order ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const byType = db
    .prepare(
      `SELECT s.store_type, COUNT(s.id) as count
       FROM stores s
       JOIN wilayas w ON w.id = s.wilaya_id
       WHERE w.is_active = 1
       GROUP BY s.store_type
       ORDER BY count DESC`
    )
    .all() as Array<{ store_type: string; count: number }>;

  const leadRows = db
    .prepare('SELECT status, COUNT(*) as count FROM leads WHERE user_id = ? GROUP BY status')
    .all(user.id) as Array<{ status: string; count: number }>;

  const leadSummary = {
    interesse: 0,
    contacte: 0,
    client: 0,
    non_interesse: 0,
    total: 0,
  };
  for (const lr of leadRows) {
    if (lr.status in leadSummary) {
      (leadSummary as Record<string, number>)[lr.status] = Number(lr.count);
      leadSummary.total += Number(lr.count);
    }
  }

  const recentStores = storeRows.slice(0, 6).map((r) => serializeStoreRow(r, user.id));

  res.json({
    total_stores: totalStores,
    active_wilayas: activeWilayas,
    total_wilayas: totalWilayas,
    avg_rating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : 0,
    total_reviews: totalReviews,
    by_wilaya: byWilaya.map((w) => ({
      wilaya_id: Number(w.wilaya_id),
      code: String(w.code),
      name: String(w.name),
      count: Number(w.count || 0),
      avg_rating: Number(w.avg_rating || 0),
      wholesale_count: Number(w.wholesale_count || 0),
    })),
    by_type: byType.map((t) => ({
      store_type: t.store_type,
      count: Number(t.count),
    })),
    data_quality: {
      phone_pct: phonePct,
      hours_pct: hoursPct,
      address_pct: addressPct,
      enriched_pct: enrichedPct,
      overall_pct: Math.round((phonePct + hoursPct + addressPct + enrichedPct) / 4),
    },
    recent_stores: recentStores,
    lead_summary: leadSummary,
  });
});

// =========================================================================
// ADMIN: USER & TERRITORY MANAGEMENT
// =========================================================================

app.get('/api/admin/users', requireAuth, requireAdmin, (_req: AuthedRequest, res: Response) => {
  const rows = db
    .prepare('SELECT id FROM users ORDER BY role ASC, created_at DESC')
    .all() as Array<{ id: number }>;

  const users = rows
    .map((r) => loadUserWithTerritories(r.id))
    .filter((u): u is AuthUser => Boolean(u));
  res.json({ users });
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = req.body?.role === 'admin' ? 'admin' : 'producer';
  const companyName =
    typeof req.body?.company_name === 'string' ? req.body.company_name.trim() : null;
  const sector = typeof req.body?.sector === 'string' ? req.body.sector.trim() : null;
  const territoryIds: number[] = Array.isArray(req.body?.territory_wilaya_ids)
    ? req.body.territory_wilaya_ids.map(Number).filter(Number.isFinite)
    : [];

  if (!email || !email.includes('@') || !fullName || password.length < 6) {
    res.status(400).json({ error: 'Email, nom complet et mot de passe (6 car. min.) requis.' });
    return;
  }

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    res.status(409).json({ error: 'Cet email est déjà enregistré.' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, full_name, role, company_name, sector)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(email, hashPassword(password), fullName, role, companyName, sector);

  const userId = Number(info.lastInsertRowid);
  const insertTerr = db.prepare(
    'INSERT OR IGNORE INTO user_territories (user_id, wilaya_id) VALUES (?, ?)'
  );
  for (const wid of territoryIds) {
    insertTerr.run(userId, wid);
  }

  res.status(201).json({ user: loadUserWithTerritories(userId) });
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  const existing = db
    .prepare('SELECT id, role, is_active, company_name, sector FROM users WHERE id = ?')
    .get(targetId) as
    | { id: number; role: string; is_active: number; company_name: string | null; sector: string | null }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Utilisateur introuvable.' });
    return;
  }

  if (targetId === req.user!.id && req.body?.is_active === false) {
    res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
    return;
  }

  const nextActive =
    req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;
  const nextRole =
    req.body?.role === 'admin' || req.body?.role === 'producer' ? req.body.role : existing.role;
  const nextCompany =
    req.body?.company_name !== undefined
      ? String(req.body.company_name || '').trim() || null
      : existing.company_name;
  const nextSector =
    req.body?.sector !== undefined ? String(req.body.sector || '').trim() || null : existing.sector;

  db.prepare(
    'UPDATE users SET is_active = ?, role = ?, company_name = ?, sector = ? WHERE id = ?'
  ).run(nextActive, nextRole, nextCompany, nextSector, targetId);

  if (Array.isArray(req.body?.territory_wilaya_ids)) {
    db.prepare('DELETE FROM user_territories WHERE user_id = ?').run(targetId);
    const insertTerr = db.prepare(
      'INSERT OR IGNORE INTO user_territories (user_id, wilaya_id) VALUES (?, ?)'
    );
    for (const wid of req.body.territory_wilaya_ids.map(Number).filter(Number.isFinite)) {
      insertTerr.run(targetId, wid);
    }
  }

  res.json({ user: loadUserWithTerritories(targetId) });
});

// =========================================================================
// ADMIN: GOOGLE MAPS SCRAPING & IMPORT PIPELINE
// =========================================================================

app.get(
  '/api/admin/scraping-jobs',
  requireAuth,
  requireAdmin,
  (_req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare('SELECT * FROM scraping_jobs ORDER BY created_at DESC LIMIT 25')
      .all() as Array<Record<string, unknown>>;

    const allWilayas = db.prepare('SELECT id, name FROM wilayas').all() as Array<{
      id: number;
      name: string;
    }>;
    const wilayaMap = new Map(allWilayas.map((w) => [w.id, w.name]));

    const jobs = rows.map((r) => {
      const wIds: number[] = JSON.parse(String(r.wilaya_ids_json || '[]'));
      const cats: string[] = JSON.parse(String(r.categories_json || '[]'));
      return {
        id: Number(r.id),
        wilaya_ids: wIds,
        wilaya_names: wIds.map((id) => wilayaMap.get(id) || `Wilaya #${id}`),
        categories: cats,
        status: String(r.status),
        found_count: Number(r.found_count),
        inserted_count: Number(r.inserted_count),
        duplicate_count: Number(r.duplicate_count),
        log_summary: String(r.log_summary),
        created_at: String(r.created_at),
        completed_at: r.completed_at ? String(r.completed_at) : null,
      };
    });

    res.json({ jobs });
  }
);

app.post(
  '/api/admin/scraping-jobs',
  requireAuth,
  requireAdmin,
  async (req: AuthedRequest, res: Response) => {
    const wilayaIds: number[] = Array.isArray(req.body?.wilaya_ids)
      ? req.body.wilaya_ids.map(Number).filter(Number.isFinite)
      : [];
    const rawCats: string[] = Array.isArray(req.body?.categories)
      ? req.body.categories.map(String).filter((c: string) => ALLOWED_STORE_TYPES.has(c))
      : ['superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche'];
    const categories = rawCats.length > 0
      ? rawCats
      : ['superette', 'mini_market', 'epicerie', 'magasin_gros', 'hypermarche'];

    const maxResults =
      req.body?.max_results !== undefined && Number(req.body.max_results) > 0
        ? Number(req.body.max_results)
        : 0; // 0 = illimité (extraire tous)
    const customKeywords: string =
      typeof req.body?.custom_keywords === 'string'
        ? String(req.body.custom_keywords).trim()
        : 'superette, mini market, grocery store, épicerie, alimentation générale, magasin de gros, hypermarché';

    if (wilayaIds.length === 0) {
      res.status(400).json({ error: 'Sélectionnez au moins une wilaya à analyser.' });
      return;
    }

    let foundCount = 0;
    let insertedCount = 0;
    let duplicateCount = 0;
    const logs: string[] = [];

    const insertStore = db.prepare(`
      INSERT INTO stores (
        name, normalized_key, wilaya_id, store_type, address, phone,
        latitude, longitude, rating, review_count, opening_hours, google_maps_url,
        main_products, approx_surface_m2, clientele_type, photo_url, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const wid of wilayaIds) {
      const w = db
        .prepare('SELECT id, code, name, name_ar, latitude, longitude FROM wilayas WHERE id = ?')
        .get(wid) as
        | { id: number; code: string; name: string; name_ar: string; latitude: number; longitude: number }
        | undefined;
      if (!w) continue;

      // Active dynamiquement la wilaya ciblée
      db.prepare('UPDATE wilayas SET is_active = 1 WHERE id = ?').run(w.id);

      // Combine le catalogue multi-communes + la grille de wilaya + découverte live OSM (Photon / Nominatim / Overpass)
      const keywordList = customKeywords
        .split(',')
        .map((k: string) => k.trim())
        .filter(Boolean);

      const liveOsmCandidates = await discoverLiveOsmStores({
        wilaya: w,
        extraKeywords: keywordList,
        includeOverpass: true,
      });

      const basePool = [
        ...(SCRAPING_CATALOG_TEMPLATES[w.code] || []),
        ...generateWilayaGridStores(w.code, w.name, w.latitude, w.longitude),
        ...liveOsmCandidates,
      ];

      let filteredCandidates = basePool.filter((c) => categories.includes(c.store_type));
      if (maxResults > 0) {
        filteredCandidates = filteredCandidates.slice(0, maxResults);
      }

      const sameWilayaExisting = db
        .prepare('SELECT id, latitude, longitude FROM stores WHERE wilaya_id = ?')
        .all(w.id) as Array<{ id: number; latitude: number; longitude: number }>;

      let wInserted = 0;
      let wDup = 0;

      for (const c of filteredCandidates) {
        foundCount += 1;
        const key = normalizeStoreKey(c.name, w.id);
        const dupName = db.prepare('SELECT id FROM stores WHERE normalized_key = ?').get(key);
        const dupGps = sameWilayaExisting.some(
          (ex) => haversineKm(c.latitude, c.longitude, ex.latitude, ex.longitude) < 0.05
        );
        if (dupName || dupGps) {
          duplicateCount += 1;
          wDup += 1;
          continue;
        }
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`;
        const photoUrl = STORE_PHOTO_BY_TYPE[c.store_type] || STORE_PHOTO_BY_TYPE.superette;
        insertStore.run(
          c.name,
          key,
          w.id,
          c.store_type,
          c.address,
          c.phone,
          c.latitude,
          c.longitude,
          c.rating,
          c.review_count,
          c.opening_hours,
          mapsUrl,
          c.main_products,
          c.approx_surface_m2,
          c.clientele_type,
          photoUrl,
          ('source' in c && c.source) ? c.source : 'Google Maps Extractor (Multi-Communes)'
        );
        sameWilayaExisting.push({ id: -1, latitude: c.latitude, longitude: c.longitude });
        insertedCount += 1;
        wInserted += 1;
      }

      logs.push(
        `${w.name} (${w.code}) [${customKeywords.slice(0, 42)}...] : ${filteredCandidates.length} analysés, ${wInserted} importés, ${wDup} doublons ignorés`
      );
    }

    const jobInfo = db
      .prepare(
        `INSERT INTO scraping_jobs (
          created_by, wilaya_ids_json, categories_json, status,
          found_count, inserted_count, duplicate_count, log_summary, completed_at
        ) VALUES (?, ?, ?, 'termine', ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        req.user!.id,
        JSON.stringify(wilayaIds),
        JSON.stringify(categories),
        foundCount,
        insertedCount,
        duplicateCount,
        logs.join(' | ')
      );

    res.status(201).json({
      job: {
        id: Number(jobInfo.lastInsertRowid),
        found_count: foundCount,
        inserted_count: insertedCount,
        duplicate_count: duplicateCount,
        log_summary: logs.join(' | '),
      },
    });
  }
);

// =========================================================================
// VITE / STATIC SERVING
// =========================================================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build introuvable.');
      }
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DistribDZ server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
