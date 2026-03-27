// DOHA Accessories - Cloudflare Worker
// - Alarm arka: çdo ditë 10:05 (E Hënë-E Shtunë)

const TG_TOKEN = '8627336914:AAF-SNxjFLW_2k8-lzLnZ82be5BzGNV-T90';
const TG_CHAT = '-5205071267';
const FIREBASE_PROJECT = 'doha-shitje';
const FIREBASE_API_KEY = 'AIzaSyARmBXSgjkjm9tVZDZL2hV52DtoikbZMKs';

async function tg(msg) {
  await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg })
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/test-alarm') {
      await kontrolloArkat();
      return new Response('Alarm u testua!');
    }
    return new Response('DOHA Worker aktiv!');
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
