const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAge, parseLeadMessage } = require('../src/gmail');

test('interpreta edades en años sin mostrar una unidad redundante', () => {
  assert.deepEqual(parseAge('5 años'), { edad: 5, edadUnidad: 'años' });
  assert.deepEqual(parseAge('5'), { edad: 5, edadUnidad: 'años' });
});

test('conserva los meses como unidad diferenciada', () => {
  assert.deepEqual(parseAge('8 meses'), { edad: 8, edadUnidad: 'meses' });
});

test('no inventa una edad cuando el texto no es interpretable', () => {
  assert.deepEqual(parseAge('aproximadamente cinco'), { edad: null, edadUnidad: null });
});

test('normaliza Principiante e importa una edad indicada en años', () => {
  const lead = parseLeadMessage({
    id: 'mensaje-de-prueba',
    internalDate: '0',
    payload: {
      headers: [{ name: 'Subject', value: 'Cañaveral Percusión' }],
      mimeType: 'text/plain',
      body: {
        data: Buffer.from([
          'Nombre', 'Miriam Márquez', 'Edad del Alumno (si es para adulto, no es necesario rellenar este campo)',
          '5 años', 'Correo electrónico', 'miriam@example.test', 'Nivel', 'Principiante',
        ].join('\n')).toString('base64url'),
      },
    },
  });

  assert.equal(lead.edad, 5);
  assert.equal(lead.edadUnidad, 'años');
  assert.equal(lead.nivel, 'Iniciación');
});
