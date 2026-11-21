function createFamiliaresStore(db, instrumentos, niveles) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_familiares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      edad INTEGER,
      instrumento TEXT,
      nivel TEXT,
      creado_en TEXT NOT NULL,
      actualizado_en TEXT NOT NULL,
      retirado_en TEXT
    );
    CREATE INDEX IF NOT EXISTS lead_familiares_lead_id ON lead_familiares(lead_id);
  `);
  const columns = db.prepare('PRAGMA table_info(lead_familiares)').all();
  if (!columns.some(({ name }) => name === 'nivel')) {
    db.exec('ALTER TABLE lead_familiares ADD COLUMN nivel TEXT');
  }

  const list = db.prepare(`
    SELECT id, nombre, edad, instrumento, nivel FROM lead_familiares
    WHERE lead_id = ? AND retirado_en IS NULL ORDER BY id
  `);
  const insert = db.prepare(`
    INSERT INTO lead_familiares (lead_id, nombre, edad, instrumento, nivel, creado_en, actualizado_en)
    VALUES (@leadId, @nombre, @edad, @instrumento, @nivel, @ahora, @ahora)
  `);
  const update = db.prepare(`
    UPDATE lead_familiares SET nombre = @nombre, edad = @edad,
      instrumento = @instrumento, nivel = @nivel, actualizado_en = @ahora
    WHERE lead_id = @leadId AND id = @id
  `);
  const retire = db.prepare(`
    UPDATE lead_familiares SET retirado_en = ?, actualizado_en = ?
    WHERE lead_id = ? AND id = ?
  `);

  function validate(familiares, leadId) {
    if (familiares === undefined) return null;
    if (!Array.isArray(familiares)) return 'Los familiares deben enviarse como una lista.';
    const existing = new Set(leadId === undefined ? [] : list.all(leadId).map(({ id }) => id));
    for (const [index, familiar] of familiares.entries()) {
      const label = `Familiar ${index + 1}`;
      if (!familiar || typeof familiar.nombre !== 'string' || !familiar.nombre.trim() || familiar.nombre.trim().length > 120) {
        return `${label}: escribe un nombre de hasta 120 caracteres.`;
      }
      if (familiar.edad != null && (!Number.isSafeInteger(familiar.edad) || familiar.edad < 0)) {
        return `${label}: la edad debe ser un número entero igual o mayor que 0.`;
      }
      if (familiar.instrumento != null && familiar.instrumento !== '' && !instrumentos.includes(familiar.instrumento)) {
        return `${label}: selecciona un instrumento de la lista.`;
      }
      if (familiar.nivel != null && familiar.nivel !== '' && !niveles.includes(familiar.nivel)) {
        return `${label}: selecciona un nivel de la lista.`;
      }
      if (familiar.id !== undefined && !existing.delete(familiar.id)) {
        return `${label}: el registro no está disponible en esta ficha. Actualiza la lista y vuelve a editar.`;
      }
    }
    return null;
  }

  // Se llama dentro de la misma transacción que guarda el lead.
  function save(leadId, familiares) {
    if (familiares === undefined) return;
    const previous = new Map(list.all(leadId).map((entry) => [entry.id, entry]));
    const ahora = new Date().toISOString();
    for (const { id, nombre, edad, instrumento, nivel } of familiares) {
      const original = previous.get(id);
      const values = {
        id, leadId, nombre: nombre.trim(), edad: edad ?? null, instrumento: instrumento || null,
        nivel: nivel === undefined ? original?.nivel ?? null : nivel || null,
        ahora,
      };
      if (id === undefined) {
        insert.run(values);
      } else {
        if (original.nombre !== values.nombre || original.edad !== values.edad
          || original.instrumento !== values.instrumento || original.nivel !== values.nivel) {
          update.run(values);
        }
        previous.delete(id);
      }
    }
    for (const id of previous.keys()) retire.run(ahora, ahora, leadId, id);
  }

  return { list: (leadId) => list.all(leadId), validate, save };
}

module.exports = { createFamiliaresStore };
