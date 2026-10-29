// Drobne narzędzia wspólne dla całego programu

export const WERSJA = '1.2.2';

export function uid(prefix = '') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36).slice(0, 4);
}

const PL_MAP = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z' };

export function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[ąćęłńóśźż]/g, (c) => PL_MAP[c])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

// Ta sama normalizacja nazw co przy imporcie (Python: norm.py)
export function norm(s) {
  let t = String(s || '').toLowerCase().normalize('NFC').trim();
  t = t.replace(/\([^)]*\)?/g, '');
  t = t.replace(/\s+np\..*$/, '');
  t = t.replace(/\s+(itp|wg oryginalnego przepisu)\.?$/, '');
  t = t.replace(/[‘’'"“”]/g, '');
  t = t.replace(/\s*–.*$/, '');
  t = t.replace(/\s+/g, ' ').replace(/^[\s,.;:\-/]+|[\s,.;:\-/]+$/g, '');
  return t;
}

// Klucz do porównań bez polskich znaków
export function fold(s) {
  return norm(s).replace(/[ąćęłńóśźż]/g, (c) => PL_MAP[c]);
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = (...a) => { if (t) { clearTimeout(t); t = null; fn(...a); } };
  d.pending = () => t !== null;
  return d;
}

export function clone(o) { return JSON.parse(JSON.stringify(o)); }

// ---------- daty ----------
const DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const DNI_KR = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];

export function dzisiaj() { return isoDate(new Date()); }
export function isoDate(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function dodajDni(s, n) { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); }
export function zakresDat(od, do_) {
  const out = []; let c = od; let guard = 0;
  while (c <= do_ && guard++ < 62) { out.push(c); c = dodajDni(c, 1); }
  return out;
}
export function roznicaDni(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 86400000); }
export function dzienTygodnia(s) { return DNI[parseIso(s).getDay()]; }
export function dzienKrotko(s) { return DNI_KR[parseIso(s).getDay()]; }
export function dataPl(s) { const d = parseIso(s); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; }
export function dataPelna(s) { return `${dzienTygodnia(s)} ${dataPl(s)}`; }

// ---------- liczby ----------
const UL = { '0.5': '½', '0.25': '¼', '0.75': '¾', '0.333': '⅓', '0.667': '⅔' };
export function liczba(x, maxDec = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '';
  const r = Math.round(x * 1000) / 1000;
  const cz = Math.floor(r + 1e-9);
  const ul = Math.round((r - cz) * 1000) / 1000;
  const key = ul.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  const frac = UL[ul.toFixed(3)] || UL[String(ul)] || UL[key];
  if (frac && ul > 0) return (cz > 0 ? cz : '') + frac;
  return (Math.round(r * 10 ** maxDec) / 10 ** maxDec).toString().replace('.', ',');
}
export function gramy(g) {
  if (g === null || g === undefined) return '';
  let v;
  if (g >= 1000) v = Math.round(g / 10) * 10;
  else if (g >= 100) v = Math.round(g / 5) * 5;
  else if (g >= 10) v = Math.round(g);
  else v = Math.round(g * 10) / 10;
  if (v >= 1000) return liczba(v / 1000, 2) + ' kg';
  return liczba(v) + ' g';
}

// Odmiana jednostek po polsku
const FORMY = {
  szt: ['szt.', 'szt.', 'szt.'],
  g: ['g', 'g', 'g'], ml: ['ml', 'ml', 'ml'],
  'łyżka': ['łyżka', 'łyżki', 'łyżek'], 'łyżeczka': ['łyżeczka', 'łyżeczki', 'łyżeczek'],
  szklanka: ['szklanka', 'szklanki', 'szklanek'], 'garść': ['garść', 'garście', 'garści'],
  'ząbek': ['ząbek', 'ząbki', 'ząbków'], plaster: ['plaster', 'plastry', 'plastrów'],
  kromka: ['kromka', 'kromki', 'kromek'], szczypta: ['szczypta', 'szczypty', 'szczypt'],
  opakowanie: ['opakowanie', 'opakowania', 'opakowań'], puszka: ['puszka', 'puszki', 'puszek'],
  'liść': ['liść', 'liście', 'liści'], listek: ['listek', 'listki', 'listków'],
  'gałązka': ['gałązka', 'gałązki', 'gałązek'], 'pęczek': ['pęczek', 'pęczki', 'pęczków'],
  kostka: ['kostka', 'kostki', 'kostek'], torebka: ['torebka', 'torebki', 'torebek'],
  woreczek: ['woreczek', 'woreczki', 'woreczków'], placek: ['placek', 'placki', 'placków'],
  kartonik: ['kartonik', 'kartoniki', 'kartoników'], butelka: ['butelka', 'butelki', 'butelek'],
  porcja: ['porcja', 'porcje', 'porcji'], partia: ['partia', 'partie', 'partii'], osoba: ['osoba', 'osoby', 'osób'], kulka: ['kulka', 'kulki', 'kulek'], 'słoik': ['słoik', 'słoiki', 'słoików'],
  'kawałek': ['kawałek', 'kawałki', 'kawałków'], 'łodyga': ['łodyga', 'łodygi', 'łodyg'], 'płat': ['płat', 'płaty', 'płatów'],
  'filiżanka': ['filiżanka', 'filiżanki', 'filiżanek'], kieliszek: ['kieliszek', 'kieliszki', 'kieliszków'],
};
export function jednostka(j, ilosc) {
  const f = FORMY[j];
  if (!f) return j || '';
  if (ilosc === null || ilosc === undefined) return f[0];
  if (Math.abs(ilosc - Math.round(ilosc)) > 1e-6) return f[1]; // ułamki: "1,5 łyżki"
  const n = Math.round(ilosc);
  if (n === 1) return f[0];
  const d = n % 10, s = n % 100;
  if (d >= 2 && d <= 4 && !(s >= 12 && s <= 14)) return f[1];
  return f[2];
}
// Rozpoznaje jednostkę po dowolnej odmianie („ząbki” → „ząbek”, „szt.” → „szt”)
export function jednostkaZFormy(tekst) {
  const t = String(tekst || '').trim().toLowerCase();
  for (const [j, f] of Object.entries(FORMY)) if (j === t || f.includes(t)) return j;
  return null;
}
export const JEDNOSTKI = Object.keys(FORMY).filter((j) => !['partia', 'osoba'].includes(j));
// "na 1 porcję", "na 3 porcje", "na 5 porcji" (biernik)
export function naPorcji(n) { return Math.abs(n - 1) < 1e-9 ? '1 porcję' : `${liczba(n)} ${jednostka('porcja', n)}`; }
export function naOsob(n) { return Math.abs(n - 1) < 1e-9 ? '1 osobę' : `${liczba(n)} ${jednostka('osoba', n)}`; }

export function iloscTekst(ilosc, jedn) {
  if (ilosc === null || ilosc === undefined || ilosc === '') return jedn ? jednostka(jedn, null) : '';
  if (jedn === 'g') return gramy(ilosc);
  if (jedn === 'ml') return liczba(Math.round(ilosc)) + ' ml';
  return `${liczba(ilosc)} ${jednostka(jedn, ilosc)}`;
}

// ---------- podobieństwo nazw ----------
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
const STOP = new Set(['z', 'ze', 'w', 'na', 'do', 'i', 'typu', 'lub', 'o', 'bez', 'od']);
// rdzeń słowa: odcina polskie końcówki fleksyjne (skyra -> skyr, jogurtu -> jogurt)
export function rdzen(w) {
  if (w.length <= 4) return w;
  return w.replace(/(owego|owej|owych|owym|ego|emu|ymi|ami|ach|ów|om|ej|ie|ia|ią|ię|iu|ki|ka|ku|ek|ych|ym|ow|a|u|y|e|i|ą|ę|o)$/u, '');
}
export function tokeny(s) {
  return fold(s).split(/[^a-z0-9%]+/).filter((w) => w && !STOP.has(w)).map(rdzen);
}
export function podobienstwo(a, b) {
  const A = fold(a), B = fold(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const ta = new Set(tokeny(a)), tb = new Set(tokeny(b));
  let wspolne = 0, wspolneDlugie = 0;
  ta.forEach((t) => { if (tb.has(t)) { wspolne++; if (t.length >= 3) wspolneDlugie++; } });
  const jacc = wspolne / Math.max(1, new Set([...ta, ...tb]).size);
  const lev = 1 - levenshtein(A, B) / Math.max(A.length, B.length);
  if (lev >= 0.85) return lev;            // literówki i odmiany ("papryki" / "papryka")
  if (!wspolneDlugie) return Math.min(0.4, lev * 0.5);
  const zaw = (A.includes(B) || B.includes(A)) ? 0.15 : 0;
  return Math.min(1, Math.max(jacc, lev * 0.8) + zaw);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function pobierzPlik(nazwa, tekst, typ = 'application/json') {
  const blob = new Blob([tekst], { type: typ });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nazwa;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// ---------- kompresja do linku QR ----------
function b64url(bytes) {
  let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(t); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function spakuj(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return b64url(buf);
}
export async function rozpakuj(s) {
  const bytes = unb64url(s);
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const txt = await new Response(stream).text();
  return JSON.parse(txt);
}
