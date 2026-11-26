import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { Pool } from 'pg';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const derived = crypto.scryptSync(password, parts[1], 64);
  const original = Buffer.from(parts[2], 'hex');
  return derived.length === original.length && crypto.timingSafeEqual(derived, original);
}

let bootstrapPromise: Promise<void> | null = null;
async function ensureInitialAdmin(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!email || !password) return;
    const admin = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (admin.rowCount) return;

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const passwordHash = hashPassword(password);
    if (existing.rowCount) {
      await pool.query(
        "UPDATE users SET password_hash = $1, role = 'admin', is_active = TRUE WHERE email = $2",
        [passwordHash, email],
      );
    } else {
      await pool.query(
        "INSERT INTO users (email, password_hash, full_name, role, company_name, sector) VALUES ($1, $2, $3, 'admin', 'DistribDZ Administration', 'Administration Plateforme')",
        [email, passwordHash, process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrateur DistribDZ'],
      );
    }
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}

type AuthUser = {
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
};

async function loadUser(userId: number): Promise<AuthUser | null> {
  const result = await pool.query(
    `SELECT id, email, full_name, role, company_name, sector, phone,
            preferred_wilaya_id, preferred_store_types, is_active, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  const territories = await pool.query(
    `SELECT w.id, w.name FROM user_territories ut
     JOIN wilayas w ON w.id = ut.wilaya_id
     WHERE ut.user_id = $1 ORDER BY w.priority_order ASC, w.code ASC`,
    [userId],
  );
  return {
    id: Number(row.id),
    email: row.email,
    full_name: row.full_name,
    role: row.role === 'admin' ? 'admin' : 'producer',
    company_name: row.company_name,
    sector: row.sector,
    phone: row.phone,
    preferred_wilaya_id: row.preferred_wilaya_id === null ? null : Number(row.preferred_wilaya_id),
    preferred_store_types: Array.isArray(row.preferred_store_types) ? row.preferred_store_types : ['superette', 'magasin_gros'],
    territory_wilaya_ids: territories.rows.map((item) => Number(item.id)),
    territory_names: territories.rows.map((item) => String(item.name)),
    is_active: Boolean(row.is_active),
    created_at: new Date(row.created_at).toISOString(),
  };
}

type AuthedRequest = Request & { user?: AuthUser; authToken?: string };

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    await ensureInitialAdmin();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });
    const session = await pool.query(
      'SELECT user_id, expires_at FROM sessions WHERE token = $1',
      [token],
    );
    if (!session.rowCount || new Date(session.rows[0].expires_at).getTime() < Date.now()) {
      if (session.rowCount) await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
      return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
    }
    const user = await loadUser(Number(session.rows[0].user_id));
    if (!user || !user.is_active) return res.status(403).json({ error: 'Compte désactivé ou introuvable.' });
    req.user = user;
    req.authToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
  }
  next();
}

async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expiresAt]);
  return token;
}

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) { next(error); }
});

app.get('/api/auth/status', async (_req, res, next) => {
  try {
    await ensureInitialAdmin();
    const result = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'");
    res.json({ has_admin: result.rows[0].c > 0, env_passcode_configured: Boolean(process.env.ADMIN_PASSCODE?.trim()) });
  } catch (error) { next(error); }
});

app.post('/api/auth/bootstrap-admin', async (req, res, next) => {
  try {
    await ensureInitialAdmin();
    const existingAdmin = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (existingAdmin.rowCount) return res.status(409).json({ error: 'Un compte administrateur est déjà configuré. Utilisez la connexion.' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !email.includes('@') || !fullName || password.length < 6) {
      return res.status(400).json({ error: 'Email valide, nom complet et mot de passe (min. 6 caractères) requis.' });
    }
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, full_name, role, company_name, sector) VALUES ($1, $2, $3, 'admin', 'DistribDZ Administration', 'Administration Plateforme') ON CONFLICT (email) DO NOTHING RETURNING id",
      [email, hashPassword(password), fullName],
    );
    if (!result.rowCount) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    const userId = Number(result.rows[0].id);
    const token = await createSession(userId);
    res.status(201).json({ token, user: await loadUser(userId) });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    await ensureInitialAdmin();
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
    const result = await pool.query(
      'SELECT id, password_hash, role, is_active FROM users WHERE email = $1',
      [email],
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Identifiants incorrects.' });
    const row = result.rows[0];
    if (!row.is_active) return res.status(403).json({ error: 'Votre compte a été désactivé par un administrateur.' });
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    const override = row.role === 'admin' && Boolean(envPasscode) && password === envPasscode;
    if (!override && !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }
    const userId = Number(row.id);
    const token = await createSession(userId);
    res.json({ token, user: await loadUser(userId) });
  } catch (error) { next(error); }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !email.includes('@') || !fullName || password.length < 6) {
      return res.status(400).json({ error: 'Email valide, nom complet et mot de passe (6 caractères min.) requis.' });
    }
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, full_name, role, company_name, sector) VALUES ($1, $2, $3, 'producer', $4, $5) ON CONFLICT (email) DO NOTHING RETURNING id",
      [email, hashPassword(password), fullName, req.body?.company_name || 'Entreprise Productrice', req.body?.sector || 'Agroalimentaire & FMCG'],
    );
    if (!result.rowCount) return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
    const userId = Number(result.rows[0].id);
    const preferredWilayaId = req.body?.preferred_wilaya_id ? Number(req.body.preferred_wilaya_id) : null;
    const rawTypes = Array.isArray(req.body?.preferred_store_types) ? req.body.preferred_store_types : ['superette', 'magasin_gros'];
    if (preferredWilayaId) {
      await pool.query('INSERT INTO user_territories (user_id, wilaya_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, preferredWilayaId]);
      await pool.query('UPDATE users SET preferred_wilaya_id = $1, preferred_store_types = $2::jsonb WHERE id = $3', [preferredWilayaId, JSON.stringify(rawTypes), userId]);
    }
    const token = await createSession(userId);
    res.status(201).json({ token, user: await loadUser(userId) });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (req.authToken) await pool.query('DELETE FROM sessions WHERE token = $1', [req.authToken]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => res.json({ user: req.user }));

app.put('/api/auth/profile', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = req.user!;
    const fullName = typeof req.body?.full_name === 'string' && req.body.full_name.trim() ? req.body.full_name.trim() : user.full_name;
    const companyName = typeof req.body?.company_name === 'string' ? req.body.company_name.trim() || null : user.company_name;
    const sector = typeof req.body?.sector === 'string' ? req.body.sector.trim() || null : user.sector;
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() || null : user.phone;
    const preferredWilayaId = req.body?.preferred_wilaya_id !== undefined ? (req.body.preferred_wilaya_id ? Number(req.body.preferred_wilaya_id) : null) : user.preferred_wilaya_id;
    const preferredTypes = Array.isArray(req.body?.preferred_store_types) ? req.body.preferred_store_types : user.preferred_store_types;
    await pool.query(
      'UPDATE users SET full_name=$1, company_name=$2, sector=$3, phone=$4, preferred_wilaya_id=$5, preferred_store_types=$6::jsonb WHERE id=$7',
      [fullName, companyName, sector, phone, preferredWilayaId, JSON.stringify(preferredTypes), user.id],
    );
    if (typeof req.body?.new_password === 'string' && req.body.new_password.length) {
      if (req.body.new_password.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères.' });
      const current = await pool.query('SELECT password_hash FROM users WHERE id=$1', [user.id]);
      if (!verifyPassword(String(req.body.current_password || ''), current.rows[0].password_hash)) {
        return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
      }
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(req.body.new_password), user.id]);
    }
    res.json({ user: await loadUser(user.id) });
  } catch (error) { next(error); }
});

app.get('/api/wilayas', async (req, res, next) => {
  try {
    await ensureInitialAdmin();
    const showAll = req.query.all === '1' || req.query.all === 'true';
    const result = await pool.query(
      `SELECT w.*, COUNT(s.id)::int AS store_count
       FROM wilayas w LEFT JOIN stores s ON s.wilaya_id = w.id
       ${showAll ? '' : 'WHERE w.is_active = TRUE'}
       GROUP BY w.id ORDER BY w.is_active DESC, w.priority_order ASC, w.code ASC`,
    );
    res.json({ wilayas: result.rows.map((w) => ({
      id: Number(w.id), code: String(w.code), name: String(w.name), name_ar: String(w.name_ar),
      region: String(w.region), latitude: Number(w.latitude), longitude: Number(w.longitude),
      is_active: Boolean(w.is_active), priority_order: Number(w.priority_order), store_count: Number(w.store_count || 0),
    })) });
  } catch (error) { next(error); }
});


app.get('/api/stats', requireAuth, async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const [counts, storesResult, byWilayaResult, byTypeResult, leadResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total_wilayas,
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_wilayas FROM wilayas`),
      pool.query(`SELECT s.*, w.code AS wilaya_code, w.name AS wilaya_name
        FROM stores s JOIN wilayas w ON w.id=s.wilaya_id
        WHERE w.is_active=TRUE ORDER BY s.created_at DESC`),
      pool.query(`SELECT w.id AS wilaya_id,w.code,w.name,COUNT(s.id)::int AS count,
        ROUND(AVG(s.rating)::numeric,2) AS avg_rating,
        COUNT(s.id) FILTER (WHERE s.store_type='magasin_gros')::int AS wholesale_count
        FROM wilayas w LEFT JOIN stores s ON s.wilaya_id=w.id
        WHERE w.is_active=TRUE GROUP BY w.id ORDER BY count DESC,w.priority_order ASC`),
      pool.query(`SELECT s.store_type,COUNT(s.id)::int AS count FROM stores s
        JOIN wilayas w ON w.id=s.wilaya_id WHERE w.is_active=TRUE
        GROUP BY s.store_type ORDER BY count DESC`),
      pool.query('SELECT status,COUNT(*)::int AS count FROM leads WHERE user_id=$1 GROUP BY status',[user.id]),
    ]);
    const rows = storesResult.rows;
    const total = rows.length;
    const rated = rows.filter((s) => s.rating !== null);
    const count = (fn: (s: any) => boolean) => rows.filter(fn).length;
    const phonePct = total ? Math.round(count((s) => Boolean(String(s.phone || '').trim())) / total * 100) : 0;
    const hoursPct = total ? Math.round(count((s) => Boolean(String(s.opening_hours || '').trim())) / total * 100) : 0;
    const addressPct = total ? Math.round(count((s) => Boolean(String(s.address || '').trim())) / total * 100) : 0;
    const enrichedPct = total ? Math.round(count((s) => Boolean(s.main_products && s.approx_surface_m2)) / total * 100) : 0;
    const leadSummary: Record<string, number> = { interesse: 0, contacte: 0, client: 0, non_interesse: 0, total: 0 };
    for (const item of leadResult.rows) {
      if (item.status in leadSummary) {
        leadSummary[item.status] = Number(item.count);
        leadSummary.total += Number(item.count);
      }
    }
    const recent = rows.slice(0, 6).map((s) => {
      const quality = 20 + (s.address && String(s.address).trim().length > 4 ? 15 : 0)
        + (s.phone && String(s.phone).trim().length > 6 ? 20 : 0)
        + (s.opening_hours && String(s.opening_hours).trim().length > 3 ? 15 : 0)
        + (s.rating !== null ? 10 : 0)
        + (s.main_products && String(s.main_products).trim().length > 3 ? 10 : 0)
        + (s.approx_surface_m2 > 0 ? 5 : 0)
        + (s.clientele_type && String(s.clientele_type).trim().length > 2 ? 5 : 0);
      const address = s.address ? String(s.address) : null;
      return {
        id:Number(s.id), name:s.name, wilaya_id:Number(s.wilaya_id), wilaya_code:s.wilaya_code,
        wilaya_name:s.wilaya_name, commune:address ? address.split(',').slice(-1)[0].trim() : s.wilaya_name,
        store_type:s.store_type, address, phone:s.phone, latitude:Number(s.latitude), longitude:Number(s.longitude),
        rating:s.rating === null ? null : Number(s.rating), review_count:Number(s.review_count || 0),
        opening_hours:s.opening_hours, google_maps_url:s.google_maps_url, main_products:s.main_products,
        approx_surface_m2:s.approx_surface_m2, clientele_type:s.clientele_type, photo_url:s.photo_url,
        source:s.source, quality_score:Math.min(100,quality), distance_km:undefined,
        lead_status:null, lead_notes:null, updated_at:new Date(s.updated_at).toISOString(),
        created_at:new Date(s.created_at).toISOString(),
      };
    });
    res.json({
      total_stores:total, active_wilayas:Number(counts.rows[0].active_wilayas),
      total_wilayas:Number(counts.rows[0].total_wilayas),
      avg_rating:rated.length ? Math.round(rated.reduce((a,s)=>a+Number(s.rating),0)/rated.length*100)/100 : 0,
      total_reviews:rows.reduce((a,s)=>a+Number(s.review_count||0),0),
      by_wilaya:byWilayaResult.rows.map((w)=>({wilaya_id:Number(w.wilaya_id),code:w.code,name:w.name,count:Number(w.count),avg_rating:Number(w.avg_rating||0),wholesale_count:Number(w.wholesale_count||0)})),
      by_type:byTypeResult.rows.map((t)=>({store_type:t.store_type,count:Number(t.count)})),
      data_quality:{phone_pct:phonePct,hours_pct:hoursPct,address_pct:addressPct,enriched_pct:enrichedPct,overall_pct:Math.round((phonePct+hoursPct+addressPct+enrichedPct)/4)},
      recent_stores:recent, lead_summary:leadSummary,
    });
  } catch (error) { next(error); }
});


type OsmElement = {
  type: string; id: number; lat?: number; lon?: number;
  center?: { lat: number; lon: number }; tags?: Record<string, string>;
};
function normalizeOsmName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function classifyOsmStore(tags: Record<string, string>): string | null {
  const shop = String(tags.shop || '').toLowerCase();
  if (['supermarket','department_store','discount'].includes(shop)) return 'superette';
  if (['convenience','kiosk'].includes(shop)) return 'mini_market';
  if (shop === 'wholesale' || tags.wholesale === 'food') return 'magasin_gros';
  if (['grocery','general','greengrocer','beverages','dairy','health_food'].includes(shop)) return 'epicerie';
  if (tags.amenity === 'marketplace') return 'magasin_gros';
  return null;
}
function osmElementCoordinates(element: OsmElement): { latitude: number; longitude: number } | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude!) > 90 || Math.abs(longitude!) > 180) return null;
  return { latitude: latitude!, longitude: longitude! };
}
function osmAddress(tags: Record<string, string>): string | null {
  const parts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village']].filter(Boolean);
  return parts.length ? parts.join(', ') : (tags['addr:full'] || null);
}

app.post('/api/discovery/osm/preview', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const wilayaId = Number(req.body?.wilaya_id);
    if (!Number.isInteger(wilayaId) || wilayaId <= 0) return res.status(400).json({ error: 'Sélectionnez une wilaya valide.' });
    const wilayaResult = await pool.query('SELECT id, code, name FROM wilayas WHERE id=$1', [wilayaId]);
    if (!wilayaResult.rowCount) return res.status(404).json({ error: 'Wilaya introuvable.' });
    const wilaya = wilayaResult.rows[0];
    const safeName = String(wilaya.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const overpassQuery = '[out:json][timeout:22];area["name"="' + safeName + '"]["boundary"="administrative"]["admin_level"="4"]->.searchArea;(nwr["shop"~"^(supermarket|convenience|grocery|wholesale|general|greengrocer|beverages|dairy|health_food|department_store|discount|kiosk)$"](area.searchArea);nwr["amenity"="marketplace"](area.searchArea););out center tags 500;';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 24000);
    let overpassResponse: globalThis.Response;
    try {
      overpassResponse = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'DistribDZ/1.0 (OSM data discovery)' },
        body: 'data=' + encodeURIComponent(overpassQuery),
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    if (!overpassResponse.ok) return res.status(502).json({ error: 'Le service OpenStreetMap a répondu HTTP ' + overpassResponse.status + '. Réessayez dans quelques minutes.' });
    const payload = await overpassResponse.json() as { elements?: OsmElement[] };
    const elements = Array.isArray(payload.elements) ? payload.elements : [];
    const existing = await pool.query('SELECT normalized_key, latitude, longitude FROM stores WHERE wilaya_id=$1', [wilayaId]);
    const existingRows = existing.rows as Array<{ normalized_key: string; latitude: number; longitude: number }>;
    const previewKeys = new Set<string>();
    const previewCoords: Array<{ latitude: number; longitude: number }> = [];
    const candidates: Array<Record<string, any>> = [];
    for (const element of elements) {
      const tags = element.tags || {};
      const name = String(tags.name || tags['name:fr'] || tags['name:ar'] || '').trim();
      const category = classifyOsmStore(tags);
      const coords = osmElementCoordinates(element);
      if (!name || !category || !coords) continue;
      const normalized = String(wilayaId) + '::' + normalizeOsmName(name);
      const distanceKm = (a: {latitude:number;longitude:number}, lat:number, lon:number) => Math.hypot(
        (a.latitude-lat)*111, (a.longitude-lon)*111*Math.cos(lat*Math.PI/180));
      const duplicateByName = existingRows.some((row) => row.normalized_key === normalized) || previewKeys.has(normalized);
      const duplicateByGps = existingRows.some((row) => distanceKm(row,coords.latitude,coords.longitude)<0.05)
        || previewCoords.some((point) => distanceKm(point,coords.latitude,coords.longitude)<0.05);
      candidates.push({
        key: element.type + '/' + element.id, osm_type: element.type, osm_id: element.id, name,
        store_type: category, address: osmAddress(tags),
        phone: tags.phone || tags['contact:phone'] || null,
        opening_hours: tags.opening_hours || null,
        latitude: coords.latitude, longitude: coords.longitude,
        osm_url: 'https://www.openstreetmap.org/' + element.type + '/' + element.id,
        duplicate: duplicateByName || duplicateByGps,
      });
      previewKeys.add(normalized);
      previewCoords.push(coords);
    }
    const unique = Array.from(new Map(candidates.map((item) => [item.key, item])).values()).slice(0, 400);
    res.json({
      wilaya: { id: Number(wilaya.id), code: String(wilaya.code), name: String(wilaya.name) },
      found_count: unique.length, duplicate_count: unique.filter((item) => item.duplicate).length,
      candidates: unique, attribution: '© OpenStreetMap contributors — données sous licence ODbL 1.0',
      attribution_url: 'https://www.openstreetmap.org/copyright',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return res.status(504).json({ error: 'La requête OpenStreetMap a dépassé le délai. Relancez la collecte pour cette wilaya.' });
    next(error);
  }
});

app.post('/api/discovery/osm/import', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const wilayaId = Number(req.body?.wilaya_id);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 400) : [];
    if (!Number.isInteger(wilayaId) || wilayaId <= 0 || items.length === 0) return res.status(400).json({ error: 'Aucun résultat valide à importer.' });
    const wilaya = await client.query('SELECT id FROM wilayas WHERE id=$1', [wilayaId]);
    if (!wilaya.rowCount) return res.status(404).json({ error: 'Wilaya introuvable.' });
    await client.query('BEGIN');
    const existing = await client.query('SELECT normalized_key, latitude, longitude FROM stores WHERE wilaya_id=$1 FOR UPDATE', [wilayaId]);
    const known = existing.rows as Array<{ normalized_key: string; latitude: number; longitude: number }>;
    let inserted = 0;
    let duplicates = 0;
    for (const raw of items) {
      const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 240) : '';
      const latitude = Number(raw?.latitude);
      const longitude = Number(raw?.longitude);
      const storeType = String(raw?.store_type || '');
      const osmType = ['node','way','relation'].includes(String(raw?.osm_type)) ? String(raw.osm_type) : '';
      const osmId = Number(raw?.osm_id);
      if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180
        || !['superette','mini_market','epicerie','magasin_gros','hypermarche','autre'].includes(storeType)
        || !osmType || !Number.isSafeInteger(osmId) || osmId<=0) continue;
      const normalizedKey = String(wilayaId) + '::' + normalizeOsmName(name);
      const isDuplicate = known.some((row) => row.normalized_key===normalizedKey || Math.hypot(
        (row.latitude-latitude)*111,(row.longitude-longitude)*111*Math.cos(latitude*Math.PI/180))<0.05);
      if (isDuplicate) { duplicates += 1; continue; }
      const address = typeof raw.address==='string' ? raw.address.slice(0,500) : null;
      const phone = typeof raw.phone==='string' ? raw.phone.slice(0,80) : null;
      const openingHours = typeof raw.opening_hours==='string' ? raw.opening_hours.slice(0,200) : null;
      const result = await client.query(
        'INSERT INTO stores (name,normalized_key,wilaya_id,store_type,address,phone,latitude,longitude,opening_hours,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (normalized_key) DO NOTHING RETURNING id',
        [name,normalizedKey,wilayaId,storeType,address,phone,latitude,longitude,openingHours,'OpenStreetMap ODbL ('+osmType+'/'+osmId+')'],
      );
      if (result.rowCount) { inserted += 1; known.push({normalized_key:normalizedKey,latitude,longitude}); }
      else duplicates += 1;
    }
    await client.query('COMMIT');
    res.status(201).json({ inserted_count: inserted, duplicate_count: duplicates, requested_count: items.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally { client.release(); }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('DistribDZ API error:', error instanceof Error ? error.message : 'Unknown error');
  res.status(500).json({ error: 'Erreur interne du serveur. Vérifiez la configuration de l’API.' });
});

export default app;
