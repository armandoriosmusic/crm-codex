const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AVAILABILITY_INTERPRETATION_INSTRUCTIONS,
  emptyAvailabilitySummary,
  normaliseAvailabilitySummary,
  parseAvailabilitySummary,
} = require('../src/availability');

test('indica que las horas ambiguas de 1 a 8 se interpretan como tarde', () => {
  assert.match(AVAILABILITY_INTERPRETATION_INSTRUCTIONS, /"5,30".*17:30/);
  assert.match(AVAILABILITY_INTERPRETATION_INSTRUCTIONS, /No la marques como pendiente/);
  assert.match(AVAILABILITY_INTERPRETATION_INSTRUCTIONS, /días disponibles.*siempre/i);
});

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

test('descarta franjas sin días y mantiene un resumen seguro ante JSON inválido', () => {
  assert.deepEqual(normaliseAvailabilitySummary({
    franjas: [{ dias: [], inicio: '', fin: '', momento: '' }],
    restricciones: [null],
    nota: 7,
    pendiente: 'sí',
  }), { ...emptyAvailabilitySummary(), pendiente: true });
  assert.deepEqual(parseAvailabilitySummary('{no es JSON}'), emptyAvailabilitySummary());
});

test('conserva los días aunque el contacto no haya indicado una hora', () => {
  assert.deepEqual(normaliseAvailabilitySummary({
    franjas: [{ dias: ['Jueves', 'Lunes', 'Martes'], inicio: '', fin: '', momento: '' }],
    restricciones: [],
    nota: '',
    pendiente: true,
  }), {
    franjas: [{ dias: ['Lunes', 'Martes', 'Jueves'], inicio: '', fin: '', momento: '' }],
    restricciones: [],
    nota: '',
    pendiente: false,
  });
});
