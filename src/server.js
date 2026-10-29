const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
const gmail = require('./gmail');

// Permite conservar la configuración local entre sesiones sin incluir secretos
// en Git. Las variables ya definidas en el entorno tienen prioridad.
function loadLocalEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const app = express();
const port = process.env.PORT || 3000;
// En producción el proceso no debe aceptar conexiones directas desde Internet.
// El proxy HTTPS de una fase posterior será el único punto de entrada público.
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : undefined);

// La ruta puede separarse del código mediante CRM_DATABASE_PATH. Si no se
// configura, se conserva la ubicación local existente para no alterar datos.
const projectRoot = path.join(__dirname, '..');
const configuredDatabasePath = process.env.CRM_DATABASE_PATH || path.join('data', 'crm.sqlite');
const databasePath = path.isAbsolute(configuredDatabasePath)
  ? configuredDatabasePath
  : path.resolve(projectRoot, configuredDatabasePath);
const dataDirectory = path.dirname(databasePath);
fs.mkdirSync(dataDirectory, { recursive: true });
const db = new Database(databasePath);

// WAL permite que SQLite gestione mejor las lecturas mientras se escriben
// nuevos leads y mantiene la estructura preparada para futuras ampliaciones.
db.pragma('journal_mode = WAL');

// Cerramos la conexión de forma ordenada para que SQLite pueda consolidar
// su archivo WAL cuando el proceso recibe una señal de apagado.
function closeDatabase() {
  if (db.open) db.close();
}

// La tabla contiene los mismos campos que utiliza actualmente el frontend.
// Los nombres snake_case son internos de SQLite; más abajo se convierten a
// camelCase para conservar intacta la API pública existente.
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    estado TEXT NOT NULL,
    instrumento TEXT,
    nivel TEXT,
    asignado_a TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    edad INTEGER,
    conversacion TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL
  )
`);

// Metadatos internos de sincronización. No se muestran como campos nuevos
// del formulario; solo permiten recordar qué correos ya se han procesado.
db.exec(`CREATE TABLE IF NOT EXISTS crm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
db.exec(`
  CREATE TABLE IF NOT EXISTS gmail_imported_messages (
    message_id TEXT PRIMARY KEY,
    lead_id INTEGER NOT NULL,
    received_at TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at)');

const sessionStatements = {
  findUserByUsername: db.prepare('SELECT * FROM users WHERE username = ? AND active = 1'),
  findSession: db.prepare(`
    SELECT sessions.token_hash, sessions.expires_at, users.id, users.username, users.display_name
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND users.active = 1
  `),
  insertSession: db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  const [, salt, expectedHex] = storedHash.split('$');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const sessionCookieName = 'crm_session';
const sessionDurationMs = 8 * 60 * 60 * 1000;

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header) {
  return Object.fromEntries((header || '').split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function serializeUser(user) {
  return {
    username: user.username,
    displayName: user.display_name,
  };
}

function setSessionCookie(res, token, maxAgeSeconds) {
  const attributes = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  res.set('Set-Cookie', attributes.join('; '));
}

function clearSessionCookie(res) {
  const attributes = [`${sessionCookieName}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  res.set('Set-Cookie', attributes.join('; '));
}

function findAuthenticatedUser(req) {
  const token = parseCookies(req.headers.cookie)[sessionCookieName];
  if (!token) return null;
  const session = sessionStatements.findSession.get(hashSessionToken(token));
  if (!session || Date.parse(session.expires_at) <= Date.now()) {
    if (session) sessionStatements.deleteSession.run(session.token_hash);
    return null;
  }
  return { ...session, token };
}

function requireAuth(req, res, next) {
  const user = findAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  req.user = user;
  next();
}

const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (userCount === 0) {
  const bootstrapUsers = [
    { username: 'armando', displayName: 'Armando', password: process.env.CRM_ARMANDO_PASSWORD },
    { username: 'humberto', displayName: 'Humberto', password: process.env.CRM_HUMBERTO_PASSWORD },
  ];
  if (bootstrapUsers.every((user) => user.password)) {
    const insertUser = db.prepare(`
      INSERT INTO users (username, display_name, password_hash, created_at)
      VALUES (@username, @displayName, @passwordHash, @createdAt)
    `);
    const createUsers = db.transaction(() => {
      const createdAt = new Date().toISOString();
      for (const user of bootstrapUsers) {
        insertUser.run({
          username: user.username,
          displayName: user.displayName,
          passwordHash: hashPassword(user.password),
          createdAt,
        });
      }
    });
    createUsers();
    console.log('Usuarios iniciales creados: armando y humberto.');
  } else {
    console.warn('No hay usuarios creados. Define CRM_ARMANDO_PASSWORD y CRM_HUMBERTO_PASSWORD para inicializarlos.');
  }
}
const existingColumns = new Set(db.prepare('PRAGMA table_info(leads)').all().map((column) => column.name));
if (!existingColumns.has('gmail_message_id')) db.exec('ALTER TABLE leads ADD COLUMN gmail_message_id TEXT');
if (!existingColumns.has('ultimo_contacto_en')) db.exec('ALTER TABLE leads ADD COLUMN ultimo_contacto_en TEXT');
if (!existingColumns.has('contactos_count')) db.exec('ALTER TABLE leads ADD COLUMN contactos_count INTEGER NOT NULL DEFAULT 1');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS leads_gmail_message_id ON leads(gmail_message_id) WHERE gmail_message_id IS NOT NULL');

app.use(express.json());

// El CRM es de uso interno: esta cabecera evita que los rastreadores indexen
// cualquier respuesta si el servicio llega a ser accesible desde Internet.
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
  }

  const user = sessionStatements.findUserByUsername.get(username.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDurationMs);
  const token = crypto.randomBytes(32).toString('base64url');
  sessionStatements.deleteExpiredSessions.run(now.toISOString());
  sessionStatements.insertSession.run(
    hashSessionToken(token),
    user.id,
    expiresAt.toISOString(),
    now.toISOString(),
  );
  setSessionCookie(res, token, Math.floor(sessionDurationMs / 1000));
  res.json({ user: serializeUser(user) });
});

app.get('/auth/me', (req, res) => {
  const user = findAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  res.json({ user: serializeUser(user) });
});

app.post('/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[sessionCookieName];
  if (token) sessionStatements.deleteSession.run(hashSessionToken(token));
  clearSessionCookie(res);
  res.status(204).end();
});

app.use('/options', requireAuth);
app.use('/leads', requireAuth);
app.use('/gmail', requireAuth);

// Opciones usadas por los desplegables de la futura interfaz.
const opciones = {
  estados: [
    'Nuevo',
    'No contesta',
    'En Contacto',
    'Pendiente de Clase Prueba',
    'Clase de Prueba Agendada',
    'Inscrito',
    'En Espera',
    'Perdido',
    'Petición Matrícula',
  ],
  instrumentos: [
    'Música para bebés (desde 6 meses)',
    'Música y movimiento (desde 3 años)',
    'Piano',
    'Canto',
    'Violín',
    'Guitarra',
    'Percusión',
  ],
  niveles: ['Iniciación', 'Intermedio', 'Avanzado'],
};

app.get('/options', (req, res) => {
  res.json(opciones);
});

// Convierte una fila de SQLite al formato JSON que ya consume el frontend.
function serializeLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    estado: row.estado,
    instrumento: row.instrumento,
    nivel: row.nivel,
    asignadoA: row.asignado_a,
    telefono: row.telefono,
    email: row.email,
    edad: row.edad,
    conversacion: row.conversacion,
    creadoEn: row.creado_en,
    ultimoContactoEn: row.ultimo_contacto_en,
  };
}

// Las consultas preparadas centralizan el acceso a la tabla y evitan
// interpolar datos recibidos por HTTP directamente en SQL.
const statements = {
  listLeads: db.prepare('SELECT * FROM leads ORDER BY id DESC'),
  exportLeads: db.prepare(`
    SELECT nombre, email, estado, instrumento, nivel, asignado_a,
      telefono, edad, conversacion, creado_en
    FROM leads
    ORDER BY COALESCE(ultimo_contacto_en, creado_en) DESC, id DESC
  `),
  findLead: db.prepare('SELECT * FROM leads WHERE id = ?'),
  insertLead: db.prepare(`
    INSERT INTO leads
      (nombre, estado, instrumento, nivel, asignado_a, telefono, email, edad, conversacion, creado_en)
    VALUES
      (@nombre, @estado, @instrumento, @nivel, @asignadoA, @telefono, @email, @edad, @conversacion, @creadoEn)
  `),
  updateLead: db.prepare(`
    UPDATE leads SET
      nombre = @nombre,
      estado = @estado,
      instrumento = @instrumento,
      nivel = @nivel,
      asignado_a = @asignadoA,
      telefono = @telefono,
      email = @email,
      edad = @edad,
      conversacion = @conversacion
    WHERE id = @id
  `),
  deleteLead: db.prepare('DELETE FROM leads WHERE id = ?'),
  findLeadByEmail: db.prepare('SELECT * FROM leads WHERE lower(trim(email)) = lower(trim(?)) ORDER BY id ASC LIMIT 1'),
  findImportedMessage: db.prepare('SELECT message_id FROM gmail_imported_messages WHERE message_id = ?'),
  recordImportedMessage: db.prepare('INSERT INTO gmail_imported_messages (message_id, lead_id, received_at) VALUES (?, ?, ?)'),
  insertImportedLead: db.prepare(`
    INSERT INTO leads
      (nombre, estado, instrumento, nivel, asignado_a, telefono, email, edad, conversacion, creado_en, gmail_message_id, ultimo_contacto_en, contactos_count)
    VALUES
      (@nombre, 'Nuevo', @instrumento, @nivel, '', @telefono, @email, @edad, @conversacion, @creadoEn, @gmailMessageId, @contactedAt, 1)
  `),
  updateImportedLead: db.prepare(`
    UPDATE leads SET
      nombre = @nombre,
      instrumento = @instrumento,
      nivel = @nivel,
      telefono = @telefono,
      email = @email,
      edad = @edad,
      conversacion = @conversacion,
      gmail_message_id = @gmailMessageId,
      ultimo_contacto_en = @contactedAt,
      contactos_count = COALESCE(contactos_count, 1) + 1
    WHERE id = @id
  `),
};

const settings = {
  get: (key) => db.prepare('SELECT value FROM crm_settings WHERE key = ?').get(key)?.value || null,
  set: db.prepare('INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
};

app.get('/leads', (req, res) => {
  const leads = statements.listLeads.all().map(serializeLead);
  res.json(leads);
});

// Escapa valores para que comas, comillas y saltos de línea no rompan el CSV.
function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

app.get('/leads/export.csv', (req, res) => {
  const headers = [
    'Nombre', 'Email', 'Estado', 'Instrumento', 'Nivel', 'Asignado a',
    'Teléfono', 'Edad', 'Conversación', 'Fecha de alta',
  ];
  const rows = statements.exportLeads.all().map((lead) => [
    lead.nombre, lead.email, lead.estado, lead.instrumento, lead.nivel,
    lead.asignado_a, lead.telefono, lead.edad, lead.conversacion, lead.creado_en,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n');
  const downloadDate = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date()).replace(/\//g, '-');
  const filename = `Leads Cañaveral Hasta ${downloadDate}.csv`;

  // BOM para que Excel reconozca correctamente las tildes del archivo.
  res
    .type('text/csv')
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    .send(`\uFEFF${csv}\r\n`);
});

app.post('/leads', (req, res) => {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'El cuerpo de la petición debe ser un objeto JSON.' });
  }

  const { nombre, estado, instrumento, nivel, asignadoA, telefono, email, edad, conversacion } = body;

  if (typeof nombre !== 'string' || !nombre.trim()) {
    return res.status(400).json({ error: 'El campo nombre es obligatorio.' });
  }

  const validaciones = [
    ['estado', estado, opciones.estados],
    ['instrumento', instrumento, opciones.instrumentos],
    ['nivel', nivel, opciones.niveles],
  ];
  for (const [campo, valor, permitidos] of validaciones) {
    if (valor !== undefined && !permitidos.includes(valor)) {
      return res.status(400).json({ error: `El campo ${campo} debe ser una de estas opciones: ${permitidos.join(', ')}.` });
    }
  }

  for (const [campo, valor] of [['asignadoA', asignadoA], ['telefono', telefono], ['email', email], ['conversacion', conversacion]]) {
    if (valor !== undefined && typeof valor !== 'string') {
      return res.status(400).json({ error: `El campo ${campo} debe ser texto.` });
    }
  }
  if (edad !== undefined && (!Number.isInteger(edad) || edad < 0)) {
    return res.status(400).json({ error: 'El campo edad debe ser un número entero igual o mayor que 0.' });
  }

  // Se normalizan los valores antes de insertarlos para que los datos
  // almacenados tengan siempre el mismo formato, incluso sin frontend.
  const lead = {
    nombre: nombre.trim(),
    estado: estado ?? 'Nuevo',
    instrumento: instrumento ?? null,
    nivel: nivel ?? null,
    asignadoA: asignadoA?.trim() ?? '',
    telefono: telefono?.trim() ?? '',
    email: email?.trim() ?? '',
    edad: edad ?? null,
    conversacion: conversacion ?? '',
    creadoEn: new Date().toISOString(),
  };

  // SQLite genera el identificador autonumérico; después se devuelve la fila
  // completa para que la respuesta conserve el contrato anterior.
  const result = statements.insertLead.run(lead);
  const savedLead = statements.findLead.get(result.lastInsertRowid);
  res.status(201).json(serializeLead(savedLead));
});

function validateLead(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'El cuerpo de la petición debe ser un objeto JSON.';
  }

  const { nombre, estado, instrumento, nivel, asignadoA, telefono, email, edad, conversacion } = body;
  if (typeof nombre !== 'string' || !nombre.trim()) {
    return 'El campo nombre es obligatorio.';
  }

  for (const [campo, valor, permitidos] of [
    ['estado', estado, opciones.estados],
    ['instrumento', instrumento, opciones.instrumentos],
    ['nivel', nivel, opciones.niveles],
  ]) {
    if (valor !== undefined && valor !== null && valor !== '' && !permitidos.includes(valor)) {
      return `El campo ${campo} debe ser una de estas opciones: ${permitidos.join(', ')}.`;
    }
  }

  for (const [campo, valor] of [['asignadoA', asignadoA], ['telefono', telefono], ['email', email], ['conversacion', conversacion]]) {
    if (valor !== undefined && typeof valor !== 'string') {
      return `El campo ${campo} debe ser texto.`;
    }
  }
  if (edad !== undefined && edad !== null && (!Number.isInteger(edad) || edad < 0)) {
    return 'El campo edad debe ser un número entero igual o mayor que 0.';
  }
  return null;
}

app.put('/leads/:id', (req, res) => {
  const id = Number(req.params.id);
  const existingLead = statements.findLead.get(id);
  if (!existingLead) return res.status(404).json({ error: 'No se encontró el lead.' });

  const error = validateLead(req.body);
  if (error) return res.status(400).json({ error });

  // La edición actualiza todos los campos editables y conserva id y fecha.
  statements.updateLead.run({
    id,
    nombre: req.body.nombre.trim(),
    estado: req.body.estado || 'No contesta',
    instrumento: req.body.instrumento || null,
    nivel: req.body.nivel || null,
    asignadoA: req.body.asignadoA?.trim() ?? '',
    telefono: req.body.telefono?.trim() ?? '',
    email: req.body.email?.trim() ?? '',
    edad: req.body.edad ?? null,
    conversacion: req.body.conversacion?.trim() ?? '',
  });
  res.json(serializeLead(statements.findLead.get(id)));
});

app.delete('/leads/:id', (req, res) => {
  const id = Number(req.params.id);
  const lead = statements.findLead.get(id);
  if (!lead) return res.status(404).json({ error: 'No se encontró el lead.' });

  // Se consulta antes de borrar para poder devolver el lead eliminado,
  // igual que hacía el endpoint original basado en memoria.
  statements.deleteLead.run(id);
  res.json(serializeLead(lead));
});

function startOfCurrentWeek() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function gmailDateQuery(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '/');
}

function appendFollowUpContactEvent(conversation, lead) {
  const event = `[${new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(lead.receivedAt))}] Nuevo formulario recibido`;
  return conversation ? `${conversation.trim()}\n${event}` : event;
}

async function synchronizeGmail() {
  if (!gmail.isConfigured()) {
    throw new Error('Gmail no está configurado. Define GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET.');
  }

  const previousSync = settings.get('gmail_last_sync_at');
  const fromDate = previousSync ? new Date(previousSync) : startOfCurrentWeek();
  // Solapamos dos días para no perder mensajes en el límite de una sincronización.
  fromDate.setDate(fromDate.getDate() - (previousSync ? 2 : 0));
  const query = `to:info@musicadelosrios.com subject:Cañaveral after:${gmailDateQuery(fromDate)}`;
  const candidates = await gmail.listMessages(query);
  let created = 0;
  let updated = 0;
  let ignored = 0;

  const importTransaction = db.transaction((lead, existingByEmail) => {
    if (statements.findImportedMessage.get(lead.gmailMessageId)) return 'duplicate';
    const existing = existingByEmail || statements.findLeadByEmail.get(lead.email);
    if (existing) {
      statements.updateImportedLead.run({
        id: existing.id,
        nombre: lead.nombre || existing.nombre,
        instrumento: lead.instrumento || existing.instrumento,
        nivel: lead.nivel || existing.nivel,
        telefono: lead.telefono || existing.telefono,
        email: lead.email || existing.email,
        edad: lead.edad ?? existing.edad,
        conversacion: appendFollowUpContactEvent(existing.conversacion, lead),
        gmailMessageId: lead.gmailMessageId,
        contactedAt: lead.receivedAt,
      });
      statements.recordImportedMessage.run(lead.gmailMessageId, existing.id, lead.receivedAt);
      return 'updated';
    }
    const result = statements.insertImportedLead.run({
      nombre: lead.nombre,
      instrumento: lead.instrumento,
      nivel: lead.nivel,
      telefono: lead.telefono,
      email: lead.email,
      edad: lead.edad,
      // El primer formulario ya queda reflejado por la fecha de alta. El
      // historial se reserva para seguimientos y contactos posteriores.
      conversacion: '',
      creadoEn: lead.receivedAt,
      gmailMessageId: lead.gmailMessageId,
      contactedAt: lead.receivedAt,
    });
    statements.recordImportedMessage.run(lead.gmailMessageId, result.lastInsertRowid, lead.receivedAt);
    return 'created';
  });

  for (const candidate of candidates) {
    const message = await gmail.getMessage(candidate.id);
    const lead = gmail.parseLeadMessage(message);
    if (!lead) {
      ignored += 1;
      continue;
    }
    const result = importTransaction(lead);
    if (result === 'created') created += 1;
    if (result === 'updated') updated += 1;
  }

  settings.set.run('gmail_last_sync_at', new Date().toISOString());
  return { created, updated, ignored, checked: candidates.length };
}

app.get('/gmail/status', (req, res) => {
  const token = gmail.readToken();
  res.json({
    configured: gmail.isConfigured(),
    authorized: Boolean(token?.refresh_token || token?.access_token),
    lastSyncAt: settings.get('gmail_last_sync_at'),
  });
});

app.get('/gmail/auth-url', (req, res) => {
  try {
    res.json({ url: gmail.authorizationUrl() });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get('/gmail/oauth/callback', async (req, res) => {
  try {
    if (!req.query.code) throw new Error('Google no devolvió un código de autorización.');
    await gmail.exchangeCode(req.query.code);
    res.redirect('/?gmail=authorized');
  } catch (error) {
    res.status(500).send(`No se pudo autorizar Gmail: ${error.message}`);
  }
});

app.post('/gmail/sync', async (req, res) => {
  try {
    res.json(await synchronizeGmail());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

const server = app.listen(port, host, () => {
  console.log(`CRM Leads API escuchando en http://${host || 'localhost'}:${port}`);
});

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Recibida ${signal}; cerrando el servidor...`);

  server.close((error) => {
    closeDatabase();
    if (error) {
      console.error('No se pudo cerrar el servidor correctamente.', error);
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    console.error('El cierre ordenado ha superado el tiempo máximo.');
    closeDatabase();
    process.exit(1);
  }, 10000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
