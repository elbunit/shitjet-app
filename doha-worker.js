// DOHA Accessories - Cloudflare Worker
// - Alarm arka: çdo ditë 10:05 (E Hënë-E Shtunë)
// - Foto proxy: /foto?id=SHITJE_ID → kthen imazhin nga Firestore

const TG_TOKEN = '8627336914:AAF-SNxjFLW_2k8-lzLnZ82be5BzGNV-T90';
const TG_CHAT = '-5205071267';
const FIREBASE_PROJECT = 'doha-shitje';
const FIREBASE_API_KEY = 'AIzaSyARmBXSgjkjm9tVZDZL2hV52DtoikbZMKs';
const WORKER_URL = 'https://muddy-dream-3105.elbunit-r.workers.dev';

async function tg(msg) {
  await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg })
  });
}

async function tgFoto(fotoUrl, caption) {
  // Dërgo foto direkt te Telegram duke përdorur URL-në e worker-it
  await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendPhoto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      photo: fotoUrl,
      caption: caption || ''
    })
  });
}

async function getToken() {
  const res = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FIREBASE_API_KEY,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error('Auth failed');
  return data.idToken;
}

async function getDoc(token, collectionId, docId) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT
    + '/databases/(default)/documents/' + collectionId + '/' + docId;
  const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
  return await res.json();
}

async function queryCollection(token, collectionId) {
  const docs = [];
  let pageToken = null;
  do {
    let url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT
      + '/databases/(default)/documents/' + collectionId + '?pageSize=300';
    if (pageToken) url += '&pageToken=' + pageToken;
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (data.documents) docs.push.apply(docs, data.documents);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return docs;
}

function getField(doc, field) {
  const f = doc.fields?.[field];
  if (!f) return null;
  return f.stringValue !== undefined ? f.stringValue
    : f.doubleValue !== undefined ? f.doubleValue
    : f.integerValue !== undefined ? parseFloat(f.integerValue)
    : f.booleanValue !== undefined ? f.booleanValue
    : null;
}

function sotStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  return d.toISOString().split('T')[0];
}

// ── FOTO PROXY ────────────────────────────────────
// /foto?id=SHITJE_ID → merr base64 nga Firestore → kthen si JPEG
async function servirFoto(shitjeId) {
  if (!shitjeId) {
    return new Response('Mungon ID', { status: 400 });
  }
  try {
    const token = await getToken();
    const doc = await getDoc(token, 'shitjet', shitjeId);

    if (!doc || !doc.fields) {
      return new Response('Shitja nuk u gjet', { status: 404 });
    }

    const fotoUrl = getField(doc, 'fotoUrl');
    if (!fotoUrl || !fotoUrl.startsWith('data:')) {
      return new Response('Kjo shitje nuk ka foto', { status: 404 });
    }

    // Parse base64: "data:image/jpeg;base64,/9j/4AAQ..."
    const commaIdx = fotoUrl.indexOf(',');
    const meta = fotoUrl.substring(5, commaIdx); // "image/jpeg;base64"
    const mimeType = meta.split(';')[0]; // "image/jpeg"
    const base64Data = fotoUrl.substring(commaIdx + 1);

    // Konverto base64 → binary
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': mimeType || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400', // cache 24 ore
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch(e) {
    return new Response('Gabim: ' + e.message, { status: 500 });
  }
}

// ── ALARM ARKA ────────────────────────────────────
async function kontrolloArkat() {
  const sot = sotStr(0);
  const dita = new Date().getUTCDay();
  if (dita === 0) return;
  try {
    const token = await getToken();
    const punetoretDocs = await queryCollection(token, 'punetoret');
    if (!punetoretDocs.length) return;
    const arkaDocs = await queryCollection(token, 'arka');
    const arkatSot = new Set();
    arkaDocs.forEach(function(d) {
      if (getField(d, 'data') === sot) {
        const uid = getField(d, 'uid');
        if (uid) arkatSot.add(uid);
      }
    });
    const paNe = [];
    punetoretDocs.forEach(function(d) {
      const uid = getField(d, 'uid');
      const emri = getField(d, 'emri') || getField(d, 'username') || 'Punetor';
      if (uid && !arkatSot.has(uid)) paNe.push(emri);
    });
    if (paNe.length > 0) {
      const ditetEmri = ['E Diel','E Hene','E Marte','E Merkure','E Enjte','E Premte','E Shtune'];
      await tg('ALARM ARKA - DOHA Accessories\n\nData: ' + sot + ' (' + ditetEmri[dita] + ')\nOra: 10:05\n\nKeta punetore nuk e kane hapur arken:\n'
        + paNe.map(function(p) { return '  - ' + p; }).join('\n')
        + '\n\nJu lutem kontaktoni menjehere!');
    }
  } catch(e) { await tg('ALARM ERROR: ' + e.message); }
}

// ── HANDLERS ──────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Foto proxy endpoint
    if (url.pathname === '/foto') {
      const id = url.searchParams.get('id');
      return await servirFoto(id);
    }

    // Test alarm
    if (url.pathname === '/test-alarm') {
      await kontrolloArkat();
      return new Response('Alarm u testua!');
    }

    // Test foto me ID
    if (url.pathname === '/test-foto') {
      const id = url.searchParams.get('id');
      if (!id) return new Response('Shto ?id=SHITJE_ID', { status: 400 });
      return await servirFoto(id);
    }

    return new Response('DOHA Worker aktiv! Endpoints: /foto?id=ID | /test-alarm');
  },

  async scheduled(event, env, ctx) {
    const now = new Date();
    const dita = now.getUTCDay();
    const ora = now.getUTCHours();
    const minuta = now.getUTCMinutes();

    // 10:05 Kosove = 09:05 UTC
    if (ora === 9 && minuta === 5 && dita !== 0) {
      await kontrolloArkat();
    }
  }
};
