const form = document.querySelector('#lead-form');
const nameInput = document.querySelector('#nombre');
const emailInput = document.querySelector('#email');
const estadoInput = document.querySelector('#estado');
const instrumentoInput = document.querySelector('#instrumento');
const nivelInput = document.querySelector('#nivel');
const submitButton = document.querySelector('#submit-button');
const formMessage = document.querySelector('#form-message');
const tableBody = document.querySelector('#leads-table-body');
const emptyState = document.querySelector('#empty-state');
const listMessage = document.querySelector('#list-message');
const refreshButton = document.querySelector('#refresh-button');
const formTitle = document.querySelector('#form-title');
const cancelEditButton = document.querySelector('#cancel-edit-button');
const leadSearchInput = document.querySelector('#lead-search');
const instrumentFilter = document.querySelector('#instrument-filter');
const statusFilter = document.querySelector('#status-filter');
const visibleLeadCount = document.querySelector('#visible-lead-count');
const exportButton = document.querySelector('#export-button');
const gmailSyncButton = document.querySelector('#gmail-sync-button');
const gmailMessage = document.querySelector('#gmail-message');
const loginPanel = document.querySelector('#login-panel');
const loginForm = document.querySelector('#login-form');
const loginUsername = document.querySelector('#login-username');
const loginPassword = document.querySelector('#login-password');
const loginButton = document.querySelector('#login-button');
const loginMessage = document.querySelector('#login-message');
const logoutButton = document.querySelector('#logout-button');
const userBar = document.querySelector('#user-bar');
const currentUser = document.querySelector('#current-user');
const protectedContent = document.querySelectorAll('.intro, .form-panel, .leads-section, footer');
const leadStatValues = {
  total: document.querySelector('#stat-total'),
  noContesta: document.querySelector('#stat-no-contesta'),
  enEspera: document.querySelector('#stat-en-espera'),
  inscrito: document.querySelector('#stat-inscrito'),
  perdido: document.querySelector('#stat-perdido'),
};
let editingLeadId = null;
let allLeads = [];

function addCell(row, value, label) {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  cell.textContent = value;
  row.append(cell);
  return cell;
}

function addTagCell(row, value, type, label) {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  if (!value) {
    cell.textContent = '—';
  } else {
    const tag = document.createElement('span');
    tag.className = `data-tag ${type}-tag tag-${slugify(value)}`;
    tag.textContent = value;
    cell.append(tag);
  }
  row.append(cell);
}

function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeLegacyAutomaticContact(entry, instrumento) {
  const prefix = /^\[[^\]]+\]\s+Ha vuelto a contactar mediante el formulario:\s*Música de los Ríos Cañaveral[\s\u00a0]+/u;
  const withoutPrefix = entry.replace(prefix, '');
  if (withoutPrefix === entry || !instrumento) return entry;

  const instrument = new RegExp(`^${escapeRegExp(instrumento)}`, 'iu');
  if (!instrument.test(withoutPrefix)) return entry;
  return withoutPrefix.replace(instrument, '').trim();
}

function latestConversationEntry(conversation, instrumento) {
  if (!conversation || !conversation.trim()) return '—';
  const entries = conversation.trim().split('\n')
    .map((entry) => removeLegacyAutomaticContact(entry.trim(), instrumento))
    .filter(Boolean);
  return entries.at(-1) || '—';
}

async function readResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const body = await response.text();
  throw new Error(response.ok
    ? 'El servidor devolvió una respuesta no válida.'
    : `El servidor no tiene disponible esta operación (${response.status}). Reinicia el backend.`);
}

function showAuthenticatedUser(user) {
  loginPanel.hidden = true;
  userBar.hidden = false;
  currentUser.textContent = user.displayName;
  protectedContent.forEach((element) => { element.hidden = false; });
}

function showLogin(message = '') {
  loginPanel.hidden = false;
  userBar.hidden = true;
  protectedContent.forEach((element) => { element.hidden = true; });
  loginMessage.textContent = message;
  loginMessage.classList.toggle('error', Boolean(message));
  loginUsername.focus();
}

function startEditing(lead) {
  editingLeadId = lead.id;
  formTitle.textContent = 'Editar lead';
  nameInput.value = lead.nombre || '';
  emailInput.value = lead.email || '';
  estadoInput.value = lead.estado || 'No contesta';
  instrumentoInput.value = lead.instrumento || '';
  nivelInput.value = lead.nivel || '';
  form.elements.asignadoA.value = lead.asignadoA || '';
  form.elements.telefono.value = lead.telefono || '';
  form.elements.edad.value = lead.edad ?? '';
  form.elements.conversacion.value = lead.conversacion || '';
  submitButton.innerHTML = 'Guardar cambios <span aria-hidden="true">↗</span>';
  cancelEditButton.hidden = false;
  formMessage.textContent = 'Editando este lead.';
  formMessage.classList.remove('error');
  nameInput.focus();
  window.scrollTo({ top: form.closest('.panel').offsetTop - 20, behavior: 'smooth' });
}

function cancelEditing() {
  editingLeadId = null;
  form.reset();
  formTitle.textContent = 'Añadir un lead';
  submitButton.innerHTML = 'Guardar lead <span aria-hidden="true">↗</span>';
  cancelEditButton.hidden = true;
  formMessage.textContent = '';
  formMessage.classList.remove('error', 'success');
}

function filterLeads() {
  const search = leadSearchInput.value.trim().toLocaleLowerCase('es');
  const instrument = instrumentFilter.value;
  const status = statusFilter.value;

  return allLeads.filter((lead) => {
    const matchesSearch = !search
      || [lead.nombre, lead.email].some((value) => (value || '').toLocaleLowerCase('es').includes(search));
    const matchesInstrument = !instrument || lead.instrumento === instrument;
    const matchesStatus = !status || (lead.estado || 'No contesta') === status;
    return matchesSearch && matchesInstrument && matchesStatus;
  }).sort((firstLead, secondLead) => {
    const firstDate = Date.parse(firstLead.ultimoContactoEn || firstLead.creadoEn || '');
    const secondDate = Date.parse(secondLead.ultimoContactoEn || secondLead.creadoEn || '');

    if (Number.isNaN(firstDate) && Number.isNaN(secondDate)) {
      return (secondLead.id || 0) - (firstLead.id || 0);
    }
    if (Number.isNaN(firstDate)) return 1;
    if (Number.isNaN(secondDate)) return -1;
    return secondDate - firstDate;
  });
}

function updateLeadStats() {
  const stats = {
    total: allLeads.length,
    noContesta: 0,
    enEspera: 0,
    inscrito: 0,
    perdido: 0,
  };

  for (const lead of allLeads) {
    const status = slugify(lead.estado || 'No contesta');
    if (status === 'no-contesta') stats.noContesta += 1;
    if (status === 'en-espera') stats.enEspera += 1;
    if (status === 'inscrito') stats.inscrito += 1;
    if (status === 'perdido') stats.perdido += 1;
  }

  for (const [key, element] of Object.entries(leadStatValues)) {
    element.textContent = String(stats[key]);
  }
}

function renderLeads(leads) {
  updateLeadStats();
  tableBody.replaceChildren();
  visibleLeadCount.textContent = String(leads.length);
  emptyState.hidden = leads.length > 0;
  emptyState.querySelector('h3').textContent = allLeads.length && !leads.length ? 'No hay coincidencias' : 'Aún no hay leads';
  emptyState.querySelector('p').textContent = allLeads.length && !leads.length
    ? 'Prueba a cambiar o limpiar los filtros.'
    : 'Cuando añadas un contacto, aparecerá aquí.';

  for (const lead of leads) {
    const row = document.createElement('tr');
    addCell(row, lead.nombre || '—', 'Nombre');

    const emailCell = document.createElement('td');
    emailCell.dataset.label = 'Email';
    if (lead.email) {
      const emailLink = document.createElement('a');
      emailLink.href = `mailto:${lead.email}`;
      emailLink.textContent = lead.email;
      emailCell.append(emailLink);
    } else {
      emailCell.textContent = '—';
    }
    row.append(emailCell);

    const stateCell = document.createElement('td');
    stateCell.dataset.label = 'Estado';
    const statePill = document.createElement('span');
    statePill.className = `state-pill tag-${slugify(lead.estado || 'No contesta')}`;
    statePill.textContent = lead.estado || 'No contesta';
    stateCell.append(statePill);
    row.append(stateCell);

    addTagCell(row, lead.instrumento, 'instrumento', 'Instrumento');
    addTagCell(row, lead.nivel, 'nivel', 'Nivel');
    addCell(row, lead.asignadoA || '—', 'Asignado a');
    addCell(row, lead.telefono || '—', 'Teléfono');
    addCell(row, lead.edad === null || lead.edad === undefined ? '—' : String(lead.edad), 'Edad');
    addCell(row, latestConversationEntry(lead.conversacion, lead.instrumento), 'Última actividad');

    const date = lead.creadoEn ? new Date(lead.creadoEn) : null;
    addCell(row, date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
      : '—', 'Fecha de alta');

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-cell';
    actionsCell.dataset.label = 'Acciones';
    const editButton = document.createElement('button');
    editButton.className = 'row-action edit-action';
    editButton.type = 'button';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => startEditing(lead));
    const deleteButton = document.createElement('button');
    deleteButton.className = 'row-action delete-action';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Eliminar';
    deleteButton.addEventListener('click', () => deleteLead(lead));
    actionsCell.append(editButton, deleteButton);
    row.append(actionsCell);
    tableBody.append(row);
  }
}

async function deleteLead(lead) {
  if (!window.confirm(`¿Eliminar el lead de ${lead.nombre}?`)) return;
  listMessage.textContent = '';
  try {
    const response = await fetch(`/leads/${lead.id}`, { method: 'DELETE' });
    const result = await readResponse(response);
    if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el lead.');
    if (editingLeadId === lead.id) cancelEditing();
    await loadLeads();
    listMessage.textContent = 'Lead eliminado correctamente.';
  } catch (error) {
    listMessage.textContent = error.message || 'No se pudo conectar con el servidor.';
    listMessage.classList.add('error');
  }
}

async function loadOptions() {
  try {
    const response = await fetch('/options');
    if (!response.ok) throw new Error('No se pudieron cargar las opciones.');
    const options = await response.json();

    for (const estado of options.estados || []) {
      const option = document.createElement('option');
      option.value = estado;
      option.textContent = estado;
      estadoInput.append(option);

      statusFilter.append(option.cloneNode(true));
    }
    for (const [input, values] of [[instrumentoInput, options.instrumentos], [nivelInput, options.niveles]]) {
      for (const value of values || []) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        input.append(option);
        if (input === instrumentoInput) instrumentFilter.append(option.cloneNode(true));
      }
    }
  } catch (error) {
    formMessage.textContent = error.message || 'No se pudieron cargar las opciones.';
    formMessage.classList.add('error');
  }
}

async function loadLeads() {
  listMessage.textContent = '';
  listMessage.classList.remove('error');
  refreshButton.disabled = true;

  try {
    const response = await fetch('/leads');
    if (!response.ok) throw new Error('No se pudo cargar la lista de leads.');
    allLeads = await response.json();
    renderLeads(filterLeads());
  } catch (error) {
    listMessage.textContent = error.message || 'No se pudo conectar con el servidor.';
    listMessage.classList.add('error');
  } finally {
    refreshButton.disabled = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';
  formMessage.classList.remove('error', 'success');
  submitButton.disabled = true;
  submitButton.textContent = 'Guardando…';

  try {
    const response = await fetch(editingLeadId ? `/leads/${editingLeadId}` : '/leads', {
      method: editingLeadId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: nameInput.value.trim(),
        email: emailInput.value.trim(),
        estado: estadoInput.value,
        instrumento: instrumentoInput.value || undefined,
        nivel: nivelInput.value || undefined,
        asignadoA: form.elements.asignadoA.value.trim(),
        telefono: form.elements.telefono.value.trim(),
        edad: form.elements.edad.value === '' ? undefined : Number(form.elements.edad.value),
        conversacion: form.elements.conversacion.value.trim(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo guardar el lead.');

    const wasEditing = editingLeadId !== null;
    cancelEditing();
    formMessage.textContent = wasEditing ? 'Lead actualizado correctamente.' : 'Lead guardado correctamente.';
    formMessage.classList.add('success');
    await loadLeads();
    nameInput.focus();
  } catch (error) {
    formMessage.textContent = error.message || 'No se pudo conectar con el servidor.';
    formMessage.classList.add('error');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Guardar lead <span aria-hidden="true">↗</span>';
  }
});

refreshButton.addEventListener('click', loadLeads);
gmailSyncButton.addEventListener('click', syncGmail);
exportButton.addEventListener('click', () => {
  window.location.href = '/leads/export.csv';
});
logoutButton.addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
  allLeads = [];
  showLogin('Sesión cerrada.');
});
cancelEditButton.addEventListener('click', cancelEditing);
leadSearchInput.addEventListener('input', () => renderLeads(filterLeads()));
instrumentFilter.addEventListener('change', () => renderLeads(filterLeads()));
statusFilter.addEventListener('change', () => renderLeads(filterLeads()));

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginMessage.textContent = '';
  loginMessage.classList.remove('error');
  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username: loginUsername.value.trim(), password: loginPassword.value }),
    });
    const result = await readResponse(response);
    if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesión.');
    loginPassword.value = '';
    showAuthenticatedUser(result.user);
    await loadOptions();
    await loadLeads();
    syncGmail({ automatic: true });
  } catch (error) {
    loginMessage.textContent = error.message || 'No se pudo conectar con el servidor.';
    loginMessage.classList.add('error');
  } finally {
    loginButton.disabled = false;
  }
});

async function initializeAuthentication() {
  try {
    const response = await fetch('/auth/me', { credentials: 'same-origin' });
    if (!response.ok) return showLogin();
    const result = await response.json();
    showAuthenticatedUser(result.user);
    await loadOptions();
    await loadLeads();
    syncGmail({ automatic: true });
  } catch (error) {
    showLogin('No se pudo conectar con el servidor.');
  }
}

initializeAuthentication();

async function syncGmail({ automatic = false } = {}) {
  gmailSyncButton.disabled = true;
  gmailMessage.className = 'list-message';
  if (!automatic) gmailMessage.textContent = 'Comprobando Gmail…';
  try {
    const statusResponse = await fetch('/gmail/status');
    const status = await statusResponse.json();
    if (!status.configured) {
      if (automatic) return;
      throw new Error('Falta configurar el acceso de Gmail en el servidor.');
    }
    if (!status.authorized) {
      if (automatic) return;
      const authResponse = await fetch('/gmail/auth-url');
      const auth = await authResponse.json();
      if (!authResponse.ok) throw new Error(auth.error || 'No se pudo preparar la autorización de Gmail.');
      window.location.href = auth.url;
      return;
    }
    const response = await fetch('/gmail/sync', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo sincronizar Gmail.');
    await loadLeads();
    gmailMessage.textContent = `Gmail sincronizado: ${result.created} nuevos, ${result.updated} actualizados.`;
  } catch (error) {
    if (automatic) return;
    gmailMessage.textContent = error.message || 'No se pudo sincronizar Gmail.';
    gmailMessage.classList.add('error');
  } finally {
    gmailSyncButton.disabled = false;
  }
}
