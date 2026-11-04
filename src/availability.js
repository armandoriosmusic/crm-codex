const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MOMENTOS = ['', 'mañana', 'mediodía', 'tarde', 'noche', 'última hora'];

// Horario operativo comunicado por Música de los Ríos: las clases pueden
// empezar excepcionalmente a las 09:00, pero predominan las de tarde y pueden
// terminar a las 22:00. Esta regla evita que expresiones coloquiales como
// "a las 5,30" queden pendientes innecesariamente.
const AVAILABILITY_INTERPRETATION_INSTRUCTIONS = [
  'Extrae disponibilidad para clases de música a partir de un texto en español.',
  'No inventes días ni horarios que el texto no sugiera.',
  'Las clases pueden empezar excepcionalmente a las 09:00, pero normalmente son de tarde y pueden terminar a las 22:00.',
  'Por tanto, una hora entre 1 y 8 sin AM/PM ni mención de mañana, tarde o noche se entiende como tarde: por ejemplo, "5,30" o "5:30" significa 17:30. No la marques como pendiente solo por esa ambigüedad.',
  'Si dice expresamente mañana, AM o una hora antes de las 9, respeta esa indicación. Para las horas 9 a 12 sin contexto conserva la hora literal y no inventes AM o PM.',
  'Conserva la incertidumbre en nota o pendiente solo cuando no haya una interpretación razonable.',
  'Usa únicamente los días Lunes, Martes, Miércoles, Jueves, Viernes, Sábado y Domingo.',
  'Cuando el texto indique días disponibles, inclúyelos siempre en la franja correspondiente; son un dato esencial y no debes omitirlos.',
  'Si indica días pero no hora, devuelve igualmente una franja con esos días y con inicio, fin y momento vacíos. No uses pendiente ni una nota para señalar que falta la hora.',
  'Para "todos los días" incluye los siete días.',
  'inicio y fin usan HH:MM o cadena vacía.',
  'momento solo puede ser cadena vacía, mañana, mediodía, tarde, noche o última hora.',
  'Las imposibilidades van en restricciones.',
  'No incluyas nombres, emails ni información ajena a la disponibilidad.',
].join(' ');

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
    if (!dias.length) return null;
    return { dias, inicio, fin, momento };
  }).filter(Boolean).slice(0, 8) : [];

  const restricciones = Array.isArray(value.restricciones)
    ? value.restricciones.map((restriction) => cleanText(restriction, 100)).filter(Boolean).slice(0, 6)
    : [];

  return {
    franjas,
    restricciones,
    nota: cleanText(value.nota, 160),
    // Una lista de días ya es información accionable, aunque falte concretar la hora.
    pendiente: Boolean(value.pendiente) && franjas.length === 0,
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
  AVAILABILITY_INTERPRETATION_INSTRUCTIONS,
  emptyAvailabilitySummary,
  hasAvailabilitySummary,
  normaliseAvailabilitySummary,
  parseAvailabilitySummary,
};
