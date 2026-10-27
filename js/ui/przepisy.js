// Przepisy: lista, przegląd po imporcie, podgląd i edycja
import { html, useState, useMemo, useEffect, Modal, Potwierdz, PoleProduktu, NowyProduktModal, useLokalny, Etykieta } from './wspolne.js';
import { stan, zmien, komunikat } from '../store.js';
import * as M from '../model.js';
import { fold, JEDNOSTKI, uid, liczba, naPorcji } from '../util.js';
import { drukujPrzepis } from '../druk.js';

export function PrzepisyView({ d, wybrany, setWybrany }) {
  const [status, setStatus] = useLokalny('statusPrzepisow', 'do_przejrzenia');
  const [szukaj, setSzukaj] = useState('');
  const [kat, setKat] = useState('');
  const [zrodlo, setZrodlo] = useState('');
  const [tylkoUlub, setTylkoUlub] = useState(false);
  const [pokazUkryte, setPokazUkryte] = useState(true);
  const [skladniki, setSkladniki] = useState([]);
  const [zaznaczone, setZaznaczone] = useState(new Set());
  const [edycja, setEdycja] = useState(null); // id albo 'nowy'
  const [zLinku, setZLinku] = useState(null); // przepis otwarty z odnośnika (np. przepis bazowy) — pokazujemy go mimo filtrów
  const w = stan.wersjaDanych;
  const liczby = useMemo(() => {
    const l = { zatwierdzony: 0, do_przejrzenia: 0, kosz: 0 };
    for (const r of Object.values(d.przepisy)) l[r.status] = (l[r.status] || 0) + 1;
    return l;
  }, [w]);
  const zrodla = useMemo(() => [...new Set(Object.values(d.przepisy).map((r) => r.zrodlo?.opis || 'Własne przepisy'))].sort(), [w]);
  const zSkl = useMemo(() => M.przepisyZProduktem(d, skladniki), [skladniki, w]);
  const lista = useMemo(() => {
    const q = fold(szukaj);
    let l = M.przepisy(d, status);
    if (kat) l = l.filter((r) => (r.kategorie || []).includes(kat));
    if (zrodlo) l = l.filter((r) => (r.zrodlo?.opis || 'Własne przepisy') === zrodlo);
    if (tylkoUlub) l = l.filter((r) => r.ulubiony);
    if (!pokazUkryte) l = l.filter((r) => !r.ukryty);
    if (q) l = l.filter((r) => fold(r.nazwa).includes(q));
    if (zSkl) l = l.filter((r) => zSkl.has(r.id));
    const coll = new Intl.Collator('pl');
    return l.sort((a, b) => (a.zrodlo?.opis || '').localeCompare(b.zrodlo?.opis || '', 'pl') || ((a.zrodlo?.strona || 0) - (b.zrodlo?.strona || 0)) || coll.compare(a.nazwa, b.nazwa));
  }, [status, szukaj, kat, zrodlo, tylkoUlub, pokazUkryte, zSkl, w]);

  useEffect(() => { setZaznaczone(new Set()); }, [status]);
  // w podglądzie pokazujemy tylko przepis widoczny na liście (albo otwarty z odnośnika), żeby nie mylić
  const r = wybrany && d.przepisy[wybrany] && (lista.some((x) => x.id === wybrany) || zLinku === wybrany) ? d.przepisy[wybrany] : null;
  const aktywneFiltry = [
    szukaj.trim() && `„${szukaj.trim()}”`, kat && M.nazwaKategorii(kat), zrodlo, tylkoUlub && '★ ulubione',
    !pokazUkryte && 'bez „nie smakowało”', ...skladniki.map((pid) => d.produkty[pid]?.nazwa),
  ].filter(Boolean);
  const wyczyscFiltry = () => { setSzukaj(''); setKat(''); setZrodlo(''); setTylkoUlub(false); setPokazUkryte(true); setSkladniki([]); };
  const wybierz = (id) => { setZLinku(null); setWybrany(id); };
  const otworzZLinku = (id) => { setZLinku(id); setWybrany(id); };
  const nastepny = (id) => {
    const i = lista.findIndex((x) => x.id === id);
    const n = lista[i + 1] || lista[i - 1];
    return n && n.id !== id ? n.id : null;
  };
  const ustawStatus = (ids, nowy) => {
    zmien((dd) => { for (const id of ids) { const x = dd.przepisy[id]; if (x) { x.status = nowy; M.oznaczEdycje(x); } } });
  };

  if (edycja) {
    return html`<${PrzepisEdycja} d=${d} id=${edycja === 'nowy' ? null : edycja} onAnuluj=${() => setEdycja(null)}
      onZapisz=${(id) => { setEdycja(null); const s = d.przepisy[id]?.status; if (s && s !== status) setStatus(s); setZLinku(id); setWybrany(id); }} />`;
  }

  return html`<div class="widok-przepisow">
    <div class="zakladki">
      ${Object.entries(M.STATUSY).map(([k, n]) => html`<button class=${'zakladka' + (status === k ? ' aktywna' : '')} onClick=${() => setStatus(k)}>${n} <span class="licznik-zakl">${liczby[k] || 0}</span></button>`)}
      <span class="odstep"></span>
      <button class="przycisk przycisk-glowny" onClick=${() => setEdycja('nowy')}>➕ Nowy przepis</button>
    </div>
    ${status === 'do_przejrzenia' && liczby.do_przejrzenia ? html`<p class="info-pasek">Przepisy z importu czekają tutaj na Twój przegląd. Do planowania trafiają dopiero po kliknięciu <strong>Zatwierdź</strong>. Niepotrzebne przenieś do kosza.</p>` : null}
    <div class="filtry">
      <input type="search" class="szukaj" placeholder="Szukaj po nazwie…" value=${szukaj} onInput=${(ev) => setSzukaj(ev.target.value)} />
      <select value=${kat} onChange=${(ev) => setKat(ev.target.value)}><option value="">Wszystkie kategorie</option>${M.KATEGORIE.map((k) => html`<option value=${k.id}>${k.nazwa}</option>`)}</select>
      <select value=${zrodlo} onChange=${(ev) => setZrodlo(ev.target.value)}><option value="">Wszystkie źródła</option>${zrodla.map((z) => html`<option value=${z}>${z}</option>`)}</select>
      <label class="przelacznik"><input type="checkbox" checked=${tylkoUlub} onChange=${(ev) => setTylkoUlub(ev.target.checked)} /> ★ ulubione</label>
      <label class="przelacznik"><input type="checkbox" checked=${pokazUkryte} onChange=${(ev) => setPokazUkryte(ev.target.checked)} /> pokaż „nie smakowało”</label>
    </div>
    <div class="filtr-skladnikow">
      <span>Ze składnikiem:</span>
      ${skladniki.map((pid) => html`<span class="chip">${d.produkty[pid]?.nazwa}<button onClick=${() => setSkladniki(skladniki.filter((x) => x !== pid))}>✕</button></span>`)}
      <div class="pole-chip"><${PoleProduktu} dane=${d} wartosc=${null} placeholder="np. cukinia, feta" onWybierz=${(pid) => { if (pid && !skladniki.includes(pid)) setSkladniki([...skladniki, pid]); }} /></div>
    </div>
    <div class="master-detail">
      <div class="lista-kol">
        <div class="pasek-zaznaczenia">
          <label class="przelacznik"><input type="checkbox" checked=${lista.length > 0 && zaznaczone.size === lista.length} onChange=${(ev) => setZaznaczone(ev.target.checked ? new Set(lista.map((x) => x.id)) : new Set())} /> zaznacz wszystkie (${lista.length})</label>
          ${zaznaczone.size ? html`<span class="akcje-zbiorcze">
            ${status !== 'zatwierdzony' ? html`<button class="przycisk przycisk-maly przycisk-glowny" onClick=${() => { ustawStatus([...zaznaczone], 'zatwierdzony'); komunikat(`Zatwierdzono ${zaznaczone.size} przepisów.`); setZaznaczone(new Set()); }}>✔ Zatwierdź (${zaznaczone.size})</button>` : null}
            ${status !== 'kosz' ? html`<button class="przycisk przycisk-maly" onClick=${() => { ustawStatus([...zaznaczone], 'kosz'); komunikat(`Przeniesiono ${zaznaczone.size} przepisów do kosza.`); setZaznaczone(new Set()); }}>🗑 Do kosza (${zaznaczone.size})</button>` : null}
            ${status === 'kosz' ? html`<button class="przycisk przycisk-maly" onClick=${() => { ustawStatus([...zaznaczone], 'do_przejrzenia'); setZaznaczone(new Set()); }}>↶ Przywróć (${zaznaczone.size})</button>` : null}
            ${status === 'zatwierdzony' ? html`<button class="przycisk przycisk-maly" onClick=${() => { ustawStatus([...zaznaczone], 'do_przejrzenia'); komunikat(`Przeniesiono ${zaznaczone.size} przepisów do „Do przejrzenia”.`); setZaznaczone(new Set()); }}>↶ Do przejrzenia (${zaznaczone.size})</button>` : null}
          </span>` : null}
        </div>
        ${aktywneFiltry.length ? html`<div class="pasek-filtrow">Filtry: <strong>${aktywneFiltry.join(' · ')}</strong> <button class="przycisk-link" onClick=${wyczyscFiltry}>wyczyść filtry</button></div>` : null}
        <ul class="lista-przepisow">
          ${lista.map((x) => html`<li class=${(x.id === wybrany ? 'wybrany' : '') + (x.ukryty ? ' ukryty' : '')}>
            <input type="checkbox" checked=${zaznaczone.has(x.id)} onChange=${(ev) => { const s = new Set(zaznaczone); if (ev.target.checked) s.add(x.id); else s.delete(x.id); setZaznaczone(s); }} />
            <button class="przycisk-link" onClick=${() => wybierz(x.id)}>
              <span class="nazwa">${x.ulubiony ? '★ ' : ''}${x.nazwa}</span>
              <span class="meta">${x.kcal ? x.kcal + ' kcal · ' : ''}${(x.kategorie || []).map(M.nazwaKategorii).join(', ')}${x.uwagaImportu ? ' · ⚠' : ''}</span>
            </button>
          </li>`)}
        </ul>
        ${lista.length === 0 && aktywneFiltry.length && liczby[status] ? html`<div class="pusto">Żaden z ${liczby[status]} przepisów nie pasuje do filtrów.<br /><button class="przycisk przycisk-maly" onClick=${wyczyscFiltry}>Wyczyść filtry</button></div>` : null}
        ${lista.length === 0 && !(aktywneFiltry.length && liczby[status]) ? html`<p class="pusto">Brak przepisów${status === 'do_przejrzenia' ? ' do przejrzenia. Nowe przepisy wczytasz w Ustawieniach → Import przepisów.' : status === 'kosz' ? ' w koszu.' : '.'}</p>` : null}
      </div>
      <div class="detal-kol">
        ${r ? html`<${PrzepisWidok} d=${d} r=${r} otworz=${otworzZLinku}
          onEdytuj=${() => setEdycja(r.id)}
          onZatwierdz=${() => { const n = nastepny(r.id); ustawStatus([r.id], 'zatwierdzony'); komunikat('Zatwierdzono: ' + r.nazwa); if (status === 'do_przejrzenia') wybierz(n); }}
          onKosz=${() => { const n = nastepny(r.id); ustawStatus([r.id], 'kosz'); komunikat('Przeniesiono do kosza: ' + r.nazwa); if (status !== 'kosz') wybierz(n); }}
          onPrzywroc=${() => ustawStatus([r.id], 'do_przejrzenia')}
          onCofnijZatwierdzenie=${() => { const n = nastepny(r.id); ustawStatus([r.id], 'do_przejrzenia'); komunikat('Przeniesiono do „Do przejrzenia”: ' + r.nazwa); if (status === 'zatwierdzony') wybierz(n); }} />`
        : html`<div class="pusto-detal">${lista.length ? 'Kliknij przepis na liście po lewej, żeby zobaczyć go tutaj.' : 'Brak przepisów do pokazania.'}</div>`}
      </div>
    </div>
  </div>`;
}

export function PrzepisWidok({ d, r, otworz, onEdytuj, onZatwierdz, onKosz, onPrzywroc, onCofnijZatwierdzenie }) {
  const [osoby, setOsoby] = useLokalny('osobyPodgladu', 2);
  const [usunNaZawsze, setUsunNaZawsze] = useState(false);
  const h = useMemo(() => M.historia(d)[r.id], [stan.wersjaDanych, r.id]);
  const skl = M.skalujSkladniki(r, osoby);
  const uzywanyW = useMemo(() => Object.values(d.przepisy).filter((x) => (x.skladniki || []).some((e) => e.przepis === r.id)), [stan.wersjaDanych, r.id]);
  const zm = (fn) => zmien((dd) => { fn(dd.przepisy[r.id]); M.oznaczEdycje(dd.przepisy[r.id]); });
  return html`<article class="przepis">
    <header class="przepis-naglowek">
      <h2>${r.nazwa}</h2>
      <div class="etykiety">
        ${r.status === 'do_przejrzenia' ? html`<${Etykieta} klasa="et-pomaranczowa">do przejrzenia<//>` : null}
        ${r.status === 'kosz' ? html`<${Etykieta} klasa="et-czerwona">w koszu<//>` : null}
        ${(r.kategorie || []).map((k) => html`<${Etykieta}>${M.nazwaKategorii(k)}<//>`)}
        ${r.ukryty ? html`<${Etykieta} klasa="et-czerwona">nie smakowało<//>` : null}
      </div>
    </header>
    <div class="przepis-akcje">
      ${r.status === 'do_przejrzenia' ? html`<button class="przycisk przycisk-glowny" onClick=${onZatwierdz}>✔ Zatwierdź</button>` : null}
      ${r.status === 'zatwierdzony' && onCofnijZatwierdzenie ? html`<button class="przycisk" onClick=${onCofnijZatwierdzenie} title="Przepis wraca do zakładki „Do przejrzenia” i nie będzie proponowany do planu">↶ Do przejrzenia</button>` : null}
      <button class="przycisk" onClick=${onEdytuj}>✎ Popraw</button>
      <button class="przycisk" onClick=${() => zm((x) => { x.ulubiony = !x.ulubiony; })}>${r.ulubiony ? '★ Ulubiony' : '☆ Do ulubionych'}</button>
      <button class="przycisk" onClick=${() => zm((x) => { x.ukryty = !x.ukryty; })} title="Przepis zostaje, ale nie pojawia się w propozycjach">${r.ukryty ? '🙂 Jednak smakuje' : '🙁 Nie smakowało'}</button>
      <button class="przycisk" onClick=${() => drukujPrzepis(d, r, osoby)}>🖨 Drukuj</button>
      ${r.status !== 'kosz' ? html`<button class="przycisk przycisk-czerwony" onClick=${onKosz}>🗑 Do kosza</button>`
      : html`<button class="przycisk" onClick=${onPrzywroc}>↶ Przywróć</button><button class="przycisk przycisk-czerwony" onClick=${() => setUsunNaZawsze(true)}>Usuń na zawsze</button>`}
    </div>
    ${r.uwagaImportu ? html`<p class="ostrzezenie">⚠ ${r.uwagaImportu}</p>` : null}
    <div class="przepis-info">
      <div class="kcal-box"><strong>${r.kcal ?? '?'} kcal</strong> na osobę
        ${r.b != null ? html`<div>B ${r.b} g · T ${r.t} g · W ${r.w} g ${r.makroSzacowane ? html`<${Etykieta} klasa="et-szara">szacunkowe<//>` : null}</div>` : html`<div class="szary">brak danych B/T/W</div>`}
        ${r.szacunekInfo ? html`<div class="szary maly">${r.szacunekInfo}</div>` : null}
      </div>
      <div>
        ${r.porcje > 1 ? html`<div>Przepis na <strong>${naPorcji(r.porcje)}</strong>${r.porcjeNaOsobe > 1 ? html`, jedna osoba zjada <strong>${liczba(r.porcjeNaOsobe)}</strong>` : null}</div>` : html`<div>Przepis na 1 porcję</div>`}
        ${r.czasMin ? html`<div>Czas: ${r.czasMin} min</div>` : null}
        <div class="szary">${M.opisHistorii(h)}</div>
        <div class="szary maly">Źródło: ${r.zrodlo?.opis || 'własny przepis'}${r.zrodlo?.strona ? `, str. ${r.zrodlo.strona}` : ''}${r.zrodlo?.dzien ? `, dzień ${r.zrodlo.dzien}` : ''}</div>
      </div>
    </div>
    <section>
      <h3>Składniki <span class="skaluj">na <select value=${osoby} onChange=${(ev) => setOsoby(Number(ev.target.value))}>${[1, 2, 3, 4, 5, 6].map((n) => html`<option value=${n}>${n}</option>`)}</select> ${osoby === 1 ? 'osobę' : 'osoby'}</span></h3>
      <ul class="skladniki">
        ${skl.map((e) => html`<li>
          ${e.przepis ? html`<button class="przycisk-link" onClick=${() => otworz(e.przepis)}>${M.opisSkladnika(e, d)} ↗</button>` : M.opisSkladnika(e, d)}
          ${e.produkt && d.produkty[e.produkt] && e.nazwa && fold(e.nazwa) !== fold(d.produkty[e.produkt].nazwa) ? html` <small class="szary">→ na liście: ${d.produkty[e.produkt].nazwa}</small>` : null}
          ${e.produkt && d.produkty[e.produkt]?.nowy ? html` <${Etykieta} klasa="et-pomaranczowa">nowy produkt<//>` : null}
        </li>`)}
      </ul>
    </section>
    ${(r.kroki || []).filter(Boolean).length ? html`<section><h3>Przygotowanie</h3>
      ${r.kroki.length === 1 ? html`<p>${r.kroki[0]}</p>` : html`<ol class="kroki">${r.kroki.map((k) => html`<li>${k}</li>`)}</ol>`}</section>` : null}
    ${r.notatka ? html`<section><h3>Notatka</h3><p>${r.notatka}</p></section>` : null}
    ${uzywanyW.length ? html`<section><h3>Używany w</h3><ul>${uzywanyW.map((x) => html`<li><button class="przycisk-link" onClick=${() => otworz(x.id)}>${x.nazwa}</button></li>`)}</ul></section>` : null}
    ${usunNaZawsze ? html`<${Potwierdz} tytul="Usunąć na zawsze?" tekst=${`Przepis „${r.nazwa}” zniknie bez możliwości przywrócenia (zostanie tylko w kopiach zapasowych).`} tak="Usuń na zawsze" niebezpieczne
      onNie=${() => setUsunNaZawsze(false)} onTak=${() => { zmien((dd) => { delete dd.przepisy[r.id]; }); setUsunNaZawsze(false); otworz(null); }} />` : null}
  </article>`;
}

// ---------- edycja ----------
function pustySkladnik() { return { klucz: uid(), produkt: null, nazwa: '', ilosc: '', jedn: 'g', g: '', uwaga: '', naPorcje: false, szyk: 'po' }; }

export function PrzepisEdycja({ d, id, onAnuluj, onZapisz }) {
  const orig = id ? d.przepisy[id] : null;
  const [f, setF] = useState(() => {
    const r = orig ? JSON.parse(JSON.stringify(orig)) : { nazwa: '', kategorie: ['obiad'], porcje: 1, porcjeNaOsobe: 1, kcal: '', b: '', t: '', w: '', makroSzacowane: false, czasMin: '', skladniki: [], kroki: [], notatka: '' };
    r.skladniki = (r.skladniki || []).map((e) => ({ ...e, klucz: uid(), ilosc: e.ilosc ?? '', g: e.g ?? '', uwaga: e.uwaga || '' }));
    if (!r.skladniki.length) r.skladniki.push(pustySkladnik());
    r.krokiTekst = (r.kroki || []).join('\n');
    return r;
  });
  const [nowyProd, setNowyProd] = useState(null); // { klucz, nazwa }
  const [notki, setNotki] = useState({}); // klucz wiersza -> informacja o automatycznej zmianie produktu
  const [blad, setBlad] = useState('');
  const ustaw = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ustawSkl = (klucz, zmiany) => setF((x) => ({ ...x, skladniki: x.skladniki.map((e) => (e.klucz === klucz ? { ...e, ...zmiany } : e)) }));
  const nazwaZProduktu = (pid) => { const n = d.produkty[pid]?.nazwa || ''; return n ? n[0].toLocaleLowerCase('pl') + n.slice(1) : ''; };
  // zmiana produktu w pierwszej kolumnie: tekst w przepisie dostaje nazwę nowego produktu
  const zmienProdukt = (e, pid) => {
    if (!pid || pid === e.produkt) return;
    ustawSkl(e.klucz, { produkt: pid, nazwa: nazwaZProduktu(pid) });
    setNotki((n) => ({ ...n, [e.klucz]: null }));
  };
  // zmiana tekstu w przepisie: jeśli tekst to nazwa innego produktu, przełączamy produkt (żeby lista zakupów się zgadzała)
  const poZmianieTekstu = (e, tekst) => {
    const pid = tekst.trim() ? M.znajdzProdukt(d, tekst, stan.wersjaDanych) : null;
    if (pid && pid !== e.produkt) {
      ustawSkl(e.klucz, { produkt: pid });
      setNotki((n) => ({ ...n, [e.klucz]: `Zmieniono składnik na „${d.produkty[pid].nazwa}”, bo tak brzmi wpisany tekst.` }));
    }
  };
  const bazowe = M.przepisy(d).filter((x) => (x.kategorie || []).includes('baza') && x.id !== id && x.status !== 'kosz');
  const zapisz = () => {
    if (!f.nazwa.trim()) { setBlad('Podaj nazwę przepisu.'); return; }
    const skl = [];
    for (const e of f.skladniki) {
      if (!e.przepis && !e.produkt && !e.nazwa.trim()) continue;
      if (!e.przepis && !e.produkt) { setBlad(`Składnik „${e.nazwa || '?'}” nie ma wybranego produktu z listy. Wybierz produkt albo dodaj nowy.`); return; }
      const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
      const o = { tekst: e.tekst || '', ilosc: num(e.ilosc), jedn: e.ilosc === '' ? (e.jedn === 'g' ? null : e.jedn) : e.jedn, naPorcje: !!e.naPorcje };
      if (e.przepis) { o.przepis = e.przepis; o.jedn = 'porcja'; o.nazwa = d.przepisy[e.przepis]?.nazwa; }
      else { o.produkt = e.produkt; o.nazwa = e.nazwa.trim() || d.produkty[e.produkt]?.nazwa; o.szyk = e.szyk || 'po'; }
      if (num(e.g)) o.g = num(e.g);
      if (e.uwaga.trim()) o.uwaga = e.uwaga.trim();
      if (e.sekcja) o.sekcja = e.sekcja;
      if (!o.tekst) o.tekst = [o.nazwa, o.ilosc != null ? `${o.ilosc} ${o.jedn || ''}` : ''].filter(Boolean).join(' – ');
      skl.push(o);
    }
    const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
    const rid = id || M.noweIdPrzepisu(d, f.nazwa);
    zmien((dd) => {
      const baza = id ? dd.przepisy[id] : { id: rid, status: 'zatwierdzony', zrodlo: { opis: 'Własne przepisy' }, utworzono: new Date().toISOString() };
      Object.assign(baza, {
        nazwa: f.nazwa.trim(), kategorie: f.kategorie, porcje: Math.max(1, num(f.porcje) || 1), porcjeNaOsobe: Math.max(0.1, num(f.porcjeNaOsobe) || 1),
        kcal: num(f.kcal), b: num(f.b), t: num(f.t), w: num(f.w), makroSzacowane: !!f.makroSzacowane, czasMin: num(f.czasMin),
        skladniki: skl, kroki: f.krokiTekst.split('\n').map((x) => x.trim()).filter(Boolean), notatka: f.notatka || '',
      });
      delete baza.uwagaImportu;
      M.oznaczEdycje(baza);
      dd.przepisy[rid] = baza;
    });
    komunikat('Zapisano przepis.');
    onZapisz(rid);
  };
  return html`<div class="edycja-przepisu">
    <h2>${id ? 'Popraw przepis' : 'Nowy przepis'}</h2>
    ${blad ? html`<p class="blad">${blad}</p>` : null}
    <label class="pole">Nazwa<input value=${f.nazwa} onInput=${(ev) => ustaw('nazwa', ev.target.value)} /></label>
    <fieldset class="pole"><legend>Kategorie (do filtrowania)</legend>
      ${M.KATEGORIE.map((k) => html`<label class="przelacznik"><input type="checkbox" checked=${f.kategorie.includes(k.id)} onChange=${(ev) => ustaw('kategorie', ev.target.checked ? [...f.kategorie, k.id] : f.kategorie.filter((x) => x !== k.id))} /> ${k.nazwa}</label>`)}
    </fieldset>
    <div class="wiersz-pol">
      <label class="pole">Przepis na ile porcji<input type="number" min="1" step="1" value=${f.porcje} onInput=${(ev) => ustaw('porcje', ev.target.value)} /></label>
      <label class="pole">Ile porcji zjada 1 osoba<input type="number" min="0.1" step="0.5" value=${f.porcjeNaOsobe} onInput=${(ev) => ustaw('porcjeNaOsobe', ev.target.value)} /></label>
      <label class="pole">Czas (min)<input type="number" min="0" value=${f.czasMin ?? ''} onInput=${(ev) => ustaw('czasMin', ev.target.value)} /></label>
    </div>
    <div class="wiersz-pol">
      <label class="pole">kcal na osobę<input type="number" value=${f.kcal ?? ''} onInput=${(ev) => ustaw('kcal', ev.target.value)} /></label>
      <label class="pole">Białko (g)<input type="number" value=${f.b ?? ''} onInput=${(ev) => ustaw('b', ev.target.value)} /></label>
      <label class="pole">Tłuszcz (g)<input type="number" value=${f.t ?? ''} onInput=${(ev) => ustaw('t', ev.target.value)} /></label>
      <label class="pole">Węglowodany (g)<input type="number" value=${f.w ?? ''} onInput=${(ev) => ustaw('w', ev.target.value)} /></label>
      <label class="przelacznik"><input type="checkbox" checked=${f.makroSzacowane} onChange=${(ev) => ustaw('makroSzacowane', ev.target.checked)} /> makro szacunkowe</label>
    </div>
    <h3>Składniki</h3>
    <p class="podpowiedz">Żeby zmienić składnik, wpisz go w pierwszej kolumnie i <strong>wybierz z podpowiedzi</strong> — to on trafi na listę zakupów, a tekst w przepisie zmieni się sam. „Tekst w przepisie” to tylko to, co czytasz w przepisie (np. „jogurt typu islandzkiego”). Zaznacz „na osobę”, jeśli ilość dotyczy jednej osoby (np. 60 g makaronu na osobę), a nie całego przepisu.</p>
    <table class="tab-skladnikow">
      <thead><tr><th>Składnik (tak będzie na liście zakupów)</th><th>Tekst w przepisie</th><th>Ilość</th><th>Jednostka</th><th>Gramy</th><th>Uwaga</th><th>Na osobę</th><th></th></tr></thead>
      <tbody>${f.skladniki.map((e) => {
        const naLiscie = e.produkt ? d.produkty[e.produkt]?.nazwa : null;
        const pasuje = !e.nazwa || !e.produkt || M.znajdzProdukt(d, e.nazwa, stan.wersjaDanych) === e.produkt;
        return html`<tr key=${e.klucz}>
        <td>${e.przepis ? html`<select value=${e.przepis} onChange=${(ev) => ustawSkl(e.klucz, { przepis: ev.target.value })}>${bazowe.map((b) => html`<option value=${b.id}>${b.nazwa}</option>`)}</select><div class="maly szary">przepis bazowy</div>`
          : html`<${PoleProduktu} dane=${d} wartosc=${e.produkt} onWybierz=${(pid) => zmienProdukt(e, pid)} onNowy=${(nazwa) => setNowyProd({ klucz: e.klucz, nazwa })} />`}</td>
        <td>${e.przepis ? html`<span class="szary">porcje</span>` : html`<input value=${e.nazwa} onInput=${(ev) => ustawSkl(e.klucz, { nazwa: ev.target.value })} onBlur=${(ev) => poZmianieTekstu(e, ev.target.value)} />
          ${notki[e.klucz] ? html`<div class="notka-ok">${notki[e.klucz]}</div>` : null}
          ${!notki[e.klucz] && !pasuje && naLiscie ? html`<div class="notka-uwaga">Na liście zakupów będzie: <strong>${naLiscie}</strong>. Jeśli to inny produkt, wybierz go w pierwszej kolumnie.</div>` : null}`}</td>
        <td><input class="w-num" type="text" inputmode="decimal" value=${e.ilosc} onInput=${(ev) => ustawSkl(e.klucz, { ilosc: ev.target.value })} /></td>
        <td>${e.przepis ? 'porcja' : html`<select value=${e.jedn || ''} onChange=${(ev) => ustawSkl(e.klucz, { jedn: ev.target.value })}><option value="">—</option>${JEDNOSTKI.map((j) => html`<option value=${j}>${j}</option>`)}</select>`}</td>
        <td><input class="w-num" type="text" inputmode="decimal" value=${e.g} onInput=${(ev) => ustawSkl(e.klucz, { g: ev.target.value })} /></td>
        <td><input value=${e.uwaga} onInput=${(ev) => ustawSkl(e.klucz, { uwaga: ev.target.value })} /></td>
        <td class="srodek"><input type="checkbox" checked=${e.naPorcje} onChange=${(ev) => ustawSkl(e.klucz, { naPorcje: ev.target.checked })} /></td>
        <td><button class="przycisk-ikona" title="Usuń składnik" onClick=${() => setF((x) => ({ ...x, skladniki: x.skladniki.filter((y) => y.klucz !== e.klucz) }))}>✕</button></td>
      </tr>`;
      })}</tbody>
    </table>
    <div class="przyciski-pod">
      <button class="przycisk" onClick=${() => setF((x) => ({ ...x, skladniki: [...x.skladniki, pustySkladnik()] }))}>➕ Składnik</button>
      ${bazowe.length ? html`<button class="przycisk" onClick=${() => setF((x) => ({ ...x, skladniki: [...x.skladniki, { ...pustySkladnik(), przepis: bazowe[0].id, jedn: 'porcja', ilosc: 1, naPorcje: true }] }))}>➕ Przepis bazowy (np. pasta)</button>` : null}
    </div>
    <label class="pole">Przygotowanie (każdy krok w osobnej linii)<textarea rows="8" value=${f.krokiTekst} onInput=${(ev) => ustaw('krokiTekst', ev.target.value)}></textarea></label>
    <label class="pole">Notatka<textarea rows="3" value=${f.notatka || ''} onInput=${(ev) => ustaw('notatka', ev.target.value)}></textarea></label>
    <div class="przyciski-pod">
      <button class="przycisk" onClick=${onAnuluj}>Anuluj</button>
      <button class="przycisk przycisk-glowny przycisk-duzy" onClick=${zapisz}>💾 Zapisz przepis</button>
    </div>
    ${nowyProd ? html`<${NowyProduktModal} dane=${d} nazwa=${nowyProd.nazwa} onAnuluj=${() => setNowyProd(null)}
      onUzyjIstniejacego=${(pid) => { ustawSkl(nowyProd.klucz, { produkt: pid, nazwa: nazwaZProduktu(pid) }); setNowyProd(null); }}
      onUtworz=${(nazwa, dzial) => { let pid; zmien((dd) => { pid = M.nowyProdukt(dd, nazwa, dzial).id; }); ustawSkl(nowyProd.klucz, { produkt: pid, nazwa: nowyProd.nazwa }); setNowyProd(null); }} />` : null}
  </div>`;
}
