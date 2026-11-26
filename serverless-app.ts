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
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
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

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('DistribDZ API error:', error instanceof Error ? error.message : 'Unknown error');
  res.status(500).json({ error: 'Erreur interne du serveur. Vérifiez la configuration de l’API.' });
});

export default app;
