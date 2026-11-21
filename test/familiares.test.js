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
    const store = createFamiliaresStore(db, ['Piano', 'Guitarra']);
    assert.deepEqual(store.list(1), []);
    const initial = [
      { nombre: 'Ana', edad: 8, instrumento: 'Piano' },
      { nombre: 'Luis', edad: 11, instrumento: 'Guitarra' },
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
    assert.match(store.validate([ana, ana], 1), /no está disponible/);

    const edited = [{ ...ana, edad: 9 }];
    assert.equal(store.validate(edited, 1), null);
    save(1, edited);
    save(1, undefined);
    assert.deepEqual(store.list(1), edited);
    assert.ok(db.prepare('SELECT retirado_en FROM lead_familiares WHERE id = ?').get(luis.id).retirado_en);
    save(1, []);
    assert.deepEqual(store.list(1), []);
    assert.equal(store.list(2)[0].nombre, 'Ana');
    assert.equal(db.prepare('SELECT conversacion FROM leads WHERE id = 1').pluck().get(), 'Historial anterior');
  } finally {
    db.close();
  }
});
