const test = require('node:test');
const assert = require('node:assert/strict');
const {
  emptyAvailabilitySummary,
  normaliseAvailabilitySummary,
  parseAvailabilitySummary,
} = require('../src/availability');

test('normaliza una disponibilidad con varias franjas y restricciones', () => {
  const summary = normaliseAvailabilitySummary({
    franjas: [
      { dias: ['Miércoles', 'Lunes', 'Lunes'], inicio: '17:30', fin: '', momento: '' },
      { dias: ['Sábado'], inicio: '', fin: '', momento: 'mañana' },
    ],
    restricciones: ['Excepto martes y jueves'],
    nota: 'Vacaciones en octubre',
    pendiente: false,
  });

  assert.deepEqual(summary, {
    franjas: [
      { dias: ['Lunes', 'Miércoles'], inicio: '17:30', fin: '', momento: '' },
      { dias: ['Sábado'], inicio: '', fin: '', momento: 'mañana' },
    ],
    restricciones: ['Excepto martes y jueves'],
    nota: 'Vacaciones en octubre',
    pendiente: false,
  });
});

test('descarta franjas incompletas y mantiene un resumen seguro ante JSON inválido', () => {
  assert.deepEqual(normaliseAvailabilitySummary({
    franjas: [{ dias: ['Lunes'], inicio: '', fin: '', momento: '' }],
    restricciones: [null],
    nota: 7,
    pendiente: 'sí',
  }), { ...emptyAvailabilitySummary(), pendiente: true });
  assert.deepEqual(parseAvailabilitySummary('{no es JSON}'), emptyAvailabilitySummary());
});
