// Wydruki: lista zakupów (A4 poziomo, 2 tabele), dni z przepisami, plan, pojedynczy przepis
import { escapeHtml as e, dataPelna, dataPl, liczba, naPorcji, naOsob, jednostka } from './util.js';
import { dniPlanu, wpis, skalujSkladniki, opisSkladnika, kcalDnia } from './model.js';
import { obliczListe, potrzebyPlanu, tytulListy } from './zakupy.js';


const MM = 96 / 25.4; // pikseli na milimetr (CSS)

function tabelaListy(k) {
  return `<table class="tab-lista"><thead><tr><th class="c-box">☐</th><th>Produkt</th><th class="c-il">Ilość</th></tr></thead><tbody>${k.map((w) => (w.typ === 'dzial'
    ? `<tr class="w-dzial"><td colspan="3">${e(w.tekst)}</td></tr>`
    : `<tr><td class="c-box">☐</td><td>${e(w.nazwa)}</td><td class="c-il">${e(w.ilosc)}</td></tr>`)).join('')}</tbody></table>`;
}

// Mierzy wysokości wierszy w przeglądarce (te same style co na wydruku), żeby strony się nie przelewały
function zmierz(wiersze, szerStronyMm, tytul) {
  const szerKol = (szerStronyMm - 8) / 2;
  const box = document.createElement('div');
  box.className = 'druk-pomiar';
  box.style.width = szerStronyMm + 'mm';
  box.innerHTML = `<header class="druk-naglowek"><h1>${e(tytul)}</h1><span>999 pozycji · strona 9/9</span></header><div style="width:${szerKol}mm">${tabelaListy(wiersze)}</div>`;
  document.body.appendChild(box);
  const naglowek = box.querySelector('.druk-naglowek').getBoundingClientRect().height + 4 * MM;
  const thead = box.querySelector('thead').getBoundingClientRect().height;
  const wys = [...box.querySelectorAll('tbody tr')].map((tr) => tr.getBoundingClientRect().height);
  box.remove();
  return { naglowek, thead, wys };
}

function stronaListy(d, plan, wynik, obrocona = false) {
  const wiersze = [];
  for (const g of wynik.grupy) {
    const poz = g.pozycje.filter((p) => !p.skreslona);
    if (!poz.length) continue;
    wiersze.push({ typ: 'dzial', tekst: g.dzial.nazwa });
    for (const p of poz) wiersze.push({ typ: 'poz', nazwa: p.nazwa, ilosc: p.ilosc, dzial: g.dzial.nazwa });
  }
  // obszar strony: poziomo A4 z marginesem 9 mm albo obrócona lista na stronie pionowej (margines 12 mm)
  const [szer, wys] = obrocona ? [272, 185] : [279, 192];
  const tytul = tytulListy(plan);
  const m = zmierz(wiersze, szer, tytul);
  const h = (i) => m.wys[i] || 6 * MM;
  const hDzialu = m.wys.find((_, i) => wiersze[i].typ === 'dzial') || 6 * MM;
  const dostepne = wys * MM - m.naglowek - m.thead - 4 * MM; // 4 mm zapasu
  const suma = m.wys.reduce((a, b) => a + b, 0);
  const cel = suma <= 2 * dostepne ? Math.min(dostepne, suma / 2 + hDzialu) : dostepne;
  const kolumny = [];
  let kol = [], zajete = 0, ostatniDzial = '';
  for (let i = 0; i < wiersze.length; i++) {
    const w = wiersze[i];
    const potrzeba = w.typ === 'dzial' && wiersze[i + 1] ? h(i) + h(i + 1) : h(i);
    const limit = kolumny.length < 1 ? cel : (kolumny.length === 1 && suma <= 2 * dostepne ? dostepne : dostepne);
    if (kol.length && zajete + potrzeba > limit) {
      kolumny.push(kol); kol = []; zajete = 0;
      if (w.typ === 'poz') { kol.push({ typ: 'dzial', tekst: ostatniDzial + ' (cd.)' }); zajete = hDzialu; }
    }
    if (w.typ === 'dzial') ostatniDzial = w.tekst;
    kol.push(w); zajete += h(i);
  }
  if (kol.length) kolumny.push(kol);
  const owin = (tresc) => (obrocona ? `<section class="strona strona-lista obrocona"><div class="obrot">${tresc}</div></section>` : `<section class="strona strona-lista">${tresc}</section>`);
  const strony = [];
  const ileStron = Math.ceil(kolumny.length / 2);
  for (let i = 0; i < kolumny.length; i += 2) {
    strony.push(owin(`<header class="druk-naglowek"><h1>${e(tytul)}</h1><span>${wynik.liczba} pozycji${ileStron > 1 ? ` · strona ${i / 2 + 1}/${ileStron}` : ''}</span></header><div class="dwie-tabele">${tabelaListy(kolumny[i])}${kolumny[i + 1] ? tabelaListy(kolumny[i + 1]) : '<div></div>'}</div>`));
  }
  if (!strony.length) strony.push(owin(`<header class="druk-naglowek"><h1>${e(tytul)}</h1></header><p>Lista jest pusta.</p>`));
  return strony.join('');
}

function blokSkladnikow(d, skl) {
  return `<ul class="druk-skladniki">${skl.map((x) => `<li>${e(opisSkladnika(x, d))}${x.przepis ? ' <em>(przepis bazowy niżej)</em>' : ''}</li>`).join('')}</ul>`;
}
function blokKrokow(r) {
  const kroki = (r.kroki || []).filter((k) => k && k.trim());
  if (!kroki.length) return '';
  return kroki.length === 1 ? `<p class="druk-kroki">${e(kroki[0])}</p>` : `<ol class="druk-kroki">${kroki.map((k) => `<li>${e(k)}</li>`).join('')}</ol>`;
}

function stronyDni(d, plan) {
  const { wspolczynnik, potrzeby } = potrzebyPlanu(d, plan);
  const wydrukowaneBazowe = new Set();
  const osobyNazwy = Object.fromEntries(d.ustawienia.osoby.map((o) => [o.id, o.imie]));
  const strony = [];
  for (const data of dniPlanu(plan)) {
    const posilki = [];
    for (const pos of d.ustawienia.posilki) {
      const w = wpis(plan, data, pos.id);
      if (!w) continue;
      const r = d.przepisy[w.przepis];
      if (!r) continue;
      const kto = w.osoby.length === d.ustawienia.osoby.length ? '' : ` <span class="druk-kto">(tylko ${w.osoby.map((o) => osobyNazwy[o]).join(', ')})</span>`;
      if (w.zGotowania) {
        posilki.push(`<article class="druk-posilek"><h3>${e(pos.nazwa)}: ${e(r.nazwa)}${kto}</h3><p class="druk-zgot">Z gotowania z dnia ${e(dataPelna(w.zGotowania))} — tylko odgrzać / nałożyć.</p></article>`);
        continue;
      }
      let osobyRazem = w.osoby.length;
      const dniZ = [];
      for (const dd of dniPlanu(plan)) { const x = wpis(plan, dd, pos.id); if (x && x.zGotowania === data) { osobyRazem += x.osoby.length; dniZ.push(dd); } }
      const skl = skalujSkladniki(r, osobyRazem);
      let html = `<article class="druk-posilek"><h3>${e(pos.nazwa)}: ${e(r.nazwa)}${kto}</h3>`;
      html += `<p class="druk-meta">${r.kcal ? `${r.kcal} kcal na osobę · ` : ''}ilości na ${naPorcji(osobyRazem)}${dniZ.length ? ` (gotuję też na: ${dniZ.map(dataPl).join(', ')})` : ''}${r.porcje > 1 ? ` · przepis na ${naPorcji(r.porcje)}` : ''}</p>`;
      html += blokSkladnikow(d, skl) + blokKrokow(r);
      if (r.notatka) html += `<p class="druk-notatka">${e(r.notatka)}</p>`;
      for (const x of skl) {
        if (!x.przepis || wydrukowaneBazowe.has(x.przepis)) continue;
        const b = d.przepisy[x.przepis]; if (!b) continue;
        wydrukowaneBazowe.add(x.przepis);
        const F = wspolczynnik[b.id] ?? 1;
        const sklB = (b.skladniki || []).map((s) => ({ ...s, ilosc: s.ilosc == null ? null : s.ilosc * F, g: s.g ? s.g * F : null }));
        const opisF = Math.abs(F - Math.round(F)) < 1e-6 ? (F === 1 ? 'cała partia' : `${F} ${jednostka('partia', F)}`) : `${liczba(F, 2)} partii (${liczba((potrzeby[b.id]?.jednostki || 0), 1)} z ${b.porcje} porcji)`;
        html += `<div class="druk-bazowy"><h4>Przepis bazowy: ${e(b.nazwa)} — ${e(opisF)}</h4>${blokSkladnikow(d, sklB)}${blokKrokow(b)}</div>`;
      }
      html += '</article>';
      posilki.push(html);
    }
    const kcal = kcalDnia(plan, d, data);
    const kcalTxt = d.ustawienia.osoby.map((o) => `${e(o.imie)}: ${Math.round(kcal[o.id].kcal)} kcal${o.celKcal ? ` / ${o.celKcal}` : ''}`).join(' · ');
    strony.push(`<section class="strona strona-dzien"><header class="druk-naglowek"><h1>${e(dataPelna(data))}</h1><span>${kcalTxt}</span></header>${posilki.length ? posilki.join('') : '<p>Brak zaplanowanych posiłków.</p>'}</section>`);
  }
  return strony.join('');
}

function stronaPlanu(d, plan) {
  const posilki = d.ustawienia.posilki;
  const wiersze = dniPlanu(plan).map((data) => {
    const kcal = kcalDnia(plan, d, data);
    const komorki = posilki.map((pos) => {
      const w = wpis(plan, data, pos.id); const r = w && d.przepisy[w.przepis];
      if (!r) return '<td></td>';
      const kto = w.osoby.length === d.ustawienia.osoby.length ? '' : ` <small>(${w.osoby.map((o) => d.ustawienia.osoby.find((x) => x.id === o)?.imie).join(', ')})</small>`;
      return `<td>${e(r.nazwa)}${kto}${w.zGotowania ? ' <small>↻</small>' : ''}</td>`;
    }).join('');
    const k = d.ustawienia.osoby.map((o) => `${e(o.imie[0])}: ${Math.round(kcal[o.id].kcal)}`).join('<br>');
    return `<tr><th>${e(dataPelna(data))}</th>${komorki}<td class="c-kcal">${k}</td></tr>`;
  }).join('');
  return `<section class="strona strona-plan"><header class="druk-naglowek"><h1>Plan posiłków ${e(dataPl(plan.od))}–${e(dataPl(plan.do))}</h1></header><table class="tab-plan"><thead><tr><th>Dzień</th>${posilki.map((p) => `<th>${e(p.nazwa)}</th>`).join('')}<th>kcal</th></tr></thead><tbody>${wiersze}</tbody></table><p class="druk-legenda">↻ = z gotowania z wcześniejszego dnia</p></section>`;
}

function stronaPrzepisu(d, r, osoby) {
  const skl = skalujSkladniki(r, osoby);
  let html = `<section class="strona strona-dzien"><header class="druk-naglowek"><h1>${e(r.nazwa)}</h1><span>${r.kcal ? r.kcal + ' kcal na osobę' : ''}</span></header>`;
  html += `<p class="druk-meta">Ilości na ${naOsob(osoby)}${r.porcje > 1 ? ` · przepis na ${naPorcji(r.porcje)}` : ''}${r.b != null ? ` · B ${r.b} g, T ${r.t} g, W ${r.w} g${r.makroSzacowane ? ' (szacunkowo)' : ''}` : ''}</p>`;
  html += blokSkladnikow(d, skl) + blokKrokow(r);
  for (const x of skl) {
    if (!x.przepis) continue; const b = d.przepisy[x.przepis]; if (!b) continue;
    html += `<div class="druk-bazowy"><h4>Przepis bazowy: ${e(b.nazwa)} (partia na ${naPorcji(b.porcje)})</h4>${blokSkladnikow(d, b.skladniki || [])}${blokKrokow(b)}</div>`;
  }
  if (r.notatka) html += `<p class="druk-notatka">${e(r.notatka)}</p>`;
  html += `<p class="druk-zrodlo">Źródło: ${e(r.zrodlo?.opis || r.zrodlo?.plik || 'własny przepis')}${r.zrodlo?.strona ? ', str. ' + r.zrodlo.strona : ''}</p></section>`;
  return html;
}

// orientacja: 'pionowo' | 'poziomo'. Przy wydruku „wszystko” lista jest obrócona na stronie pionowej,
// bo nie każda drukarka/przeglądarka obsługuje różne orientacje w jednym wydruku.
function drukuj(html, orientacja = 'pionowo') {
  let el = document.getElementById('druk');
  if (!el) { el = document.createElement('div'); el.id = 'druk'; document.body.appendChild(el); }
  el.innerHTML = html;
  let st = document.getElementById('druk-strona');
  if (!st) { st = document.createElement('style'); st.id = 'druk-strona'; document.head.appendChild(st); }
  st.textContent = orientacja === 'poziomo' ? '@page { size: A4 landscape; margin: 9mm; }' : '@page { size: A4 portrait; margin: 12mm; }';
  document.body.classList.add('drukowanie');
  const po = () => { document.body.classList.remove('drukowanie'); window.removeEventListener('afterprint', po); };
  window.addEventListener('afterprint', po);
  setTimeout(() => window.print(), 50);
}

export function drukujListe(d, plan) { drukuj(stronaListy(d, plan, obliczListe(d, plan)), 'poziomo'); }
export function drukujDni(d, plan) { drukuj(stronyDni(d, plan), 'pionowo'); }
export function drukujPlan(d, plan) { drukuj(stronaPlanu(d, plan), 'poziomo'); }
export function drukujWszystko(d, plan) { drukuj(stronaListy(d, plan, obliczListe(d, plan), true) + stronyDni(d, plan), 'pionowo'); }
export function drukujPrzepis(d, r, osoby) { drukuj(stronaPrzepisu(d, r, osoby), 'pionowo'); }
// do testów
export const _html = { stronaListy, stronyDni, stronaPlanu, stronaPrzepisu };
