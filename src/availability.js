const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MOMENTOS = ['', 'mañana', 'mediodía', 'tarde', 'noche', 'última hora'];

function emptyAvailabilitySummary() {
  return { franjas: [], restricciones: [], nota: '', pendiente: false };
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normaliseAvailabilitySummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyAvailabilitySummary();

  const franjas = Array.isArray(value.franjas) ? value.franjas.map((franja) => {
    if (!franja || typeof franja !== 'object' || Array.isArray(franja)) return null;
    const dias = Array.isArray(franja.dias)
      ? [...new Set(franja.dias.filter((dia) => DIAS.includes(dia)))].sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b))
      : [];
    const inicio = cleanText(franja.inicio, 5);
    const fin = cleanText(franja.fin, 5);
    const momento = MOMENTOS.includes(franja.momento) ? franja.momento : '';
    if (!dias.length || (!inicio && !fin && !momento)) return null;
    return { dias, inicio, fin, momento };
  }).filter(Boolean).slice(0, 8) : [];

  const restricciones = Array.isArray(value.restricciones)
    ? value.restricciones.map((restriction) => cleanText(restriction, 100)).filter(Boolean).slice(0, 6)
    : [];

  return {
    franjas,
    restricciones,
    nota: cleanText(value.nota, 160),
    pendiente: Boolean(value.pendiente),
  };
}

function parseAvailabilitySummary(value) {
  if (!value || typeof value !== 'string') return emptyAvailabilitySummary();
  try {
    return normaliseAvailabilitySummary(JSON.parse(value));
  } catch {
    return emptyAvailabilitySummary();
  }
}

function hasAvailabilitySummary(summary) {
  return summary.franjas.length > 0
    || summary.restricciones.length > 0
    || Boolean(summary.nota)
    || summary.pendiente;
}

module.exports = {
  DIAS,
  MOMENTOS,
  emptyAvailabilitySummary,
  hasAvailabilitySummary,
  normaliseAvailabilitySummary,
  parseAvailabilitySummary,
};
