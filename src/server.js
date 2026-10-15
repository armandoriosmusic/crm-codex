const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3000;

// La base de datos vive dentro del proyecto para que los leads sobrevivan
// a los reinicios del servidor y puedan respaldarse junto con la aplicación.
const dataDirectory = path.join(__dirname, '..', 'data');
const databasePath = path.join(dataDirectory, 'crm.sqlite');
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
process.once('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.once('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

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

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Opciones usadas por los desplegables de la futura interfaz.
const opciones = {
  estados: [
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
    ORDER BY id DESC
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
    estado: estado ?? 'No contesta',
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

app.listen(port, () => {
  console.log(`CRM Leads API escuchando en http://localhost:${port}`);
});
