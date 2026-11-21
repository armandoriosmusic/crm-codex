const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createFamiliaresStore } = require('../src/familiares');

test('vincula, edita y retira familiares sin mezclar ni alterar los leads existentes', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE leads (id INTEGER PRIMARY KEY, conversacion TEXT NOT NULL);
      INSERT INTO leads VALUES (1, 'Historial anterior'), (2, 'Otra ficha');
    `);
    const store = createFamiliaresStore(db, ['Piano', 'Guitarra'], ['Iniciación', 'Intermedio', 'Avanzado']);
    assert.deepEqual(store.list(1), []);
    const initial = [
      { nombre: 'Ana', edad: 8, instrumento: 'Piano', nivel: 'Iniciación' },
      { nombre: 'Luis', edad: 11, instrumento: 'Guitarra', nivel: null },
    ];
    assert.equal(store.validate(initial), null);
    const save = db.transaction(store.save);
    save(1, initial);
    save(2, [initial[0]]);
    const [ana, luis] = store.list(1);
    assert.deepEqual(store.list(1), initial.map((entry, index) => ({ id: index + 1, ...entry })));
    assert.notEqual(store.list(2)[0].id, ana.id);
    assert.match(store.validate([ana], 2), /no está disponible/);
    assert.match(store.validate([{ ...ana, edad: -1 }], 1), /edad/);
    assert.match(store.validate([{ ...ana, instrumento: 'Inválido' }], 1), /instrumento/);
    assert.match(store.validate([{ ...ana, nivel: 'Inválido' }], 1), /nivel/);
    assert.match(store.validate([ana, ana], 1), /no está disponible/);

    const edited = [{ ...ana, edad: 9, nivel: 'Intermedio' }];
    assert.equal(store.validate(edited, 1), null);
    save(1, edited);
    save(1, undefined);
    save(1, [{ ...edited[0], nivel: undefined }]);
    assert.deepEqual(store.list(1), edited);
    save(1, [{ ...edited[0], nivel: null }]);
    assert.equal(store.list(1)[0].nivel, null);
    assert.ok(db.prepare('SELECT retirado_en FROM lead_familiares WHERE id = ?').get(luis.id).retirado_en);
    save(1, []);
    assert.deepEqual(store.list(1), []);
    assert.equal(store.list(2)[0].nombre, 'Ana');
    assert.equal(db.prepare('SELECT conversacion FROM leads WHERE id = 1').pluck().get(), 'Historial anterior');
  } finally {
    db.close();
  }
});

test('añade el nivel a una base anterior y conserva los familiares activos y retirados', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE leads (id INTEGER PRIMARY KEY);
      INSERT INTO leads VALUES (1);
      CREATE TABLE lead_familiares (
        id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, nombre TEXT NOT NULL,
        edad INTEGER, instrumento TEXT, creado_en TEXT NOT NULL,
        actualizado_en TEXT NOT NULL, retirado_en TEXT
      );
      INSERT INTO lead_familiares VALUES
        (7, 1, 'Ana', 8, 'Piano', '2026-11-21', '2026-11-21', NULL),
        (8, 1, 'Luis', 11, 'Piano', '2026-11-21', '2026-11-21', '2026-11-21');
    `);
    const makeStore = () => createFamiliaresStore(db, ['Piano'], ['Iniciación']);
    const store = makeStore();
    assert.deepEqual(store.list(1), [{ id: 7, nombre: 'Ana', edad: 8, instrumento: 'Piano', nivel: null }]);
    assert.equal(db.prepare('SELECT retirado_en FROM lead_familiares WHERE id = 8').pluck().get(), '2026-11-21');
    db.transaction(store.save)(1, [{ ...store.list(1)[0], nivel: 'Iniciación' }]);
    assert.equal(makeStore().list(1)[0].nivel, 'Iniciación');
  } finally {
    db.close();
  }
});
