const fs = require('fs');
const path = require('path');

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const tokenPath = path.join(__dirname, '..', 'data', 'gmail-token.json');

function getConfig() {
  return {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    redirectUri: process.env.GMAIL_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/gmail/oauth/callback`,
  };
}

function isConfigured() {
  const config = getConfig();
  return Boolean(config.clientId && config.clientSecret);
}

function readToken() {
  try {
    return JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function saveToken(token) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
}

function authorizationUrl() {
  const config = getConfig();
  if (!isConfigured()) throw new Error('Faltan GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET.');
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPE,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const config = getConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || result.error || 'No se pudo autorizar Gmail.');
  saveToken({ ...result, expires_at: Date.now() + (result.expires_in || 3600) * 1000 });
}

async function getAccessToken() {
  const config = getConfig();
  const token = readToken();
  if (!token) throw new Error('Gmail todavía no está autorizado.');
  if (token.expires_at && token.expires_at > Date.now() + 60000) return token.access_token;
  if (!token.refresh_token) throw new Error('El token de Gmail ha caducado. Autoriza Gmail de nuevo.');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || result.error || 'No se pudo renovar el acceso a Gmail.');
  saveToken({ ...token, ...result, refresh_token: token.refresh_token, expires_at: Date.now() + (result.expires_in || 3600) * 1000 });
  return result.access_token;
}

function decodeBase64Url(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function findPart(payload, mimeType) {
  if (!payload) return '';
  if (payload.mimeType === mimeType && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts || []) {
    const result = findPart(part, mimeType);
    if (result) return result;
  }
  return '';
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>|<\/th>|<\/tr>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function headerValue(headers, name) {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function valueAfterLabel(text, label) {
  const lines = text.split('\n');
  const normalizedLabel = label.toLocaleLowerCase('es');
  const index = lines.findIndex((line) => {
    const normalizedLine = line.replace(/:$/, '').trim().toLocaleLowerCase('es');
    return normalizedLine === normalizedLabel || normalizedLine.startsWith(`${normalizedLabel} (`);
  });
  return index >= 0 ? (lines[index + 1] || '').trim() : '';
}

function subjectInstrument(subject) {
  const normalized = subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const match = normalized.match(/canaveral\s+(.+)$/);
  if (!match) return null;
  const interest = match[1].trim();
  const options = [
    ['musica para bebes', 'Música para bebés (desde 6 meses)'],
    ['musica y movimiento', 'Música y movimiento (desde 3 años)'],
    ['piano', 'Piano'],
    ['canto', 'Canto'],
    ['violin', 'Violín'],
    ['guitarra', 'Guitarra'],
    ['percusion', 'Percusión'],
  ];
  return options.find(([key]) => interest.startsWith(key))?.[1] || interest;
}

function parseLeadMessage(message) {
  const headers = message.payload?.headers || [];
  const subject = headerValue(headers, 'Subject');
  const html = findPart(message.payload, 'text/html');
  const plain = findPart(message.payload, 'text/plain');
  const text = htmlToText(html || plain);
  const email = valueAfterLabel(text, 'Correo electrónico') || headerValue(headers, 'Reply-To').match(/<([^>]+)>/)?.[1] || headerValue(headers, 'Reply-To');
  const nombre = valueAfterLabel(text, 'Nombre');
  if (!nombre || !email || !subjectInstrument(subject)) return null;
  const ageText = valueAfterLabel(text, 'Edad del Alumno');
  const age = ageText && /^\d+$/.test(ageText) ? Number(ageText) : null;
  return {
    gmailMessageId: message.id,
    nombre,
    email: email.trim().toLowerCase(),
    telefono: valueAfterLabel(text, 'Teléfono'),
    edad: age,
    instrumento: subjectInstrument(subject),
    nivel: valueAfterLabel(text, 'Nivel') || null,
    subject,
    receivedAt: new Date(Number(message.internalDate || Date.now())).toISOString(),
  };
}

async function gmailRequest(endpoint, options = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Gmail rechazó la petición.');
  return result;
}

async function listMessages(query) {
  const messages = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ q: query, maxResults: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await gmailRequest(`messages?${params}`);
    messages.push(...(result.messages || []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return messages;
}

async function getMessage(id) {
  return gmailRequest(`messages/${encodeURIComponent(id)}?format=full`);
}

module.exports = {
  authorizationUrl,
  exchangeCode,
  getMessage,
  isConfigured,
  listMessages,
  parseLeadMessage,
  readToken,
};
