// Widok listy zakupów
import { html, useState, useMemo, useEffect, Modal, Etykieta } from './wspolne.js';
import { stan, zmien, komunikat } from '../store.js';
import { obliczListe, listaJakoTekst, linkiQR, tytulListy, odejmijIlosc, rozbijIlosc } from '../zakupy.js';
import { drukujListe } from '../druk.js';
import { liczba, uid, naPorcji } from '../util.js';
import { opisPlanu } from './plan.js';
import qrcode from '../../vendor/qrcode.mjs';

export function ZakupyView({ d, wybranyPlan, ustawPlan, idzDoPlanu, idzDoUstawien }) {
  const plan = d.plany.find((p) => p.id === wybranyPlan) || d.plany[0] || null;
  const [qr, setQr] = useState(false);
  const [rozwin, setRozwin] = useState(null);
  const [edytuj, setEdytuj] = useState(null);
  const [nowa, setNowa] = useState({ nazwa: '', ilosc: '', dzial: 'inn' });
  const wynik = useMemo(() => (plan ? obliczListe(d, plan) : null), [plan?.id, stan.wersjaDanych]);
  if (!plan) return html`<div class="pusty-stan"><h2>Najpierw utwórz plan</h2><p>Lista zakupów powstaje z planu posiłków.</p><button class="przycisk przycisk-glowny" onClick=${idzDoPlanu}>Przejdź do planu</button></div>`;
  const zm = (fn) => zmien((dd) => fn(dd.plany.find((x) => x.id === plan.id)));
  const przelaczSkreslenie = (klucz) => zm((p) => { const s = new Set(p.lista.skreslone); if (s.has(klucz)) s.delete(klucz); else s.add(klucz); p.lista.skreslone = [...s]; });
  const brakDecyzji = wynik.partie.filter((x) => !x.decyzja).length;
  // poprawka ilości: nowa = tekst (pusty = nic nie kupujemy, null = wróć do wyliczonej)
  const zapiszIlosc = (p, nowa, mam) => zm((pl) => {
    pl.lista.korekty ||= {};
    if (p.wlasna) { const w = pl.lista.wlasne.find((x) => x.id === p.id); if (w) w.ilosc = nowa || ''; return; }
    if (nowa === null) { delete pl.lista.korekty[p.klucz]; return; }
    if (nowa === '') {
      delete pl.lista.korekty[p.klucz];
      const s = new Set(pl.lista.skreslone); s.add(p.klucz); pl.lista.skreslone = [...s];
      komunikat(`${p.nazwa}: macie wszystko w domu — skreślone z listy.`);
      return;
    }
    pl.lista.korekty[p.klucz] = { ilosc: nowa, wyliczone: p.wyliczona || '', ...(mam ? { mam } : {}) };
  });
  const dodajWlasna = () => {
    if (!nowa.nazwa.trim()) return;
    zm((p) => p.lista.wlasne.push({ id: uid(), nazwa: nowa.nazwa.trim(), ilosc: nowa.ilosc.trim(), dzial: nowa.dzial }));
    setNowa({ nazwa: '', ilosc: '', dzial: nowa.dzial });
  };
  const kopiuj = async () => {
    try { await navigator.clipboard.writeText(listaJakoTekst(plan, wynik)); komunikat('Skopiowano listę — wklej ją np. w Messengerze albo notatkach.'); }
    catch { komunikat('Nie udało się skopiować do schowka.', 'blad'); }
  };
  return html`<div class="widok-zakupow">
    <div class="pasek-narzedzi">
      <label class="wybor-planu">Plan:
        <select value=${plan.id} onChange=${(ev) => ustawPlan(ev.target.value)}>${d.plany.slice().sort((a, b) => (a.od < b.od ? 1 : -1)).map((p) => html`<option value=${p.id}>${opisPlanu(p)}</option>`)}</select>
      </label>
      <span class="odstep"></span>
      <button class="przycisk przycisk-glowny" onClick=${() => drukujListe(d, plan)}>🖨 Drukuj listę</button>
      <button class="przycisk" onClick=${() => setQr(true)}>📱 Na telefon (kod QR)</button>
      <button class="przycisk" onClick=${kopiuj}>📋 Kopiuj jako tekst</button>
    </div>
    <h2>${tytulListy(plan)} <small class="szary">· ${wynik.liczba} pozycji</small></h2>

    ${wynik.partie.length ? html`<section class=${'partie' + (brakDecyzji ? ' czeka' : '')}>
      <h3>${brakDecyzji ? `⚠ ${brakDecyzji} ${brakDecyzji === 1 ? 'przepis czeka' : 'przepisy czekają'} na decyzję` : 'Przepisy na partie'}</h3>
      <p class="podpowiedz">Te przepisy robi się na kilka porcji, a w planie potrzeba mniej (albo nie pełną wielokrotność). Zdecyduj, czy kupujecie na całą partię, czy tylko tyle, ile trzeba.</p>
      ${wynik.partie.map((x) => html`<div class="partia">
        <div><strong>${x.nazwa}</strong> <span class="szary">— przepis na ${naPorcji(x.porcje)}, w planie potrzeba ${liczba(x.potrzebne)}</span></div>
        <label class="przelacznik"><input type="radio" name=${'p-' + x.przepisId} checked=${x.decyzja === 'cala'} onChange=${() => zm((p) => { p.lista.partie[x.przepisId] = 'cala'; })} /> Cała partia${x.calych > 1 ? ` ×${x.calych}` : ''}</label>
        <label class="przelacznik"><input type="radio" name=${'p-' + x.przepisId} checked=${x.decyzja === 'prop'} onChange=${() => zm((p) => { p.lista.partie[x.przepisId] = 'prop'; })} /> Tylko potrzebna ilość (${liczba(x.potrzebne)} z ${x.porcje})</label>
        ${!x.decyzja ? html`<${Etykieta} klasa="et-pomaranczowa">na razie liczę „tylko potrzebna ilość”<//>` : null}
      </div>`)}
    </section>` : null}

    <div class="dwie-kolumny">
      <div class="lista-zakupow">
        ${wynik.grupy.length === 0 ? html`<p class="pusto">Lista jest pusta — dodaj dania do planu.</p>` : null}
        ${wynik.grupy.map((g) => html`<section class="grupa-zakupow">
          <h3>${g.dzial.nazwa}</h3>
          <ul>${g.pozycje.map((p) => html`<li class=${(p.skreslona ? 'skreslona' : '') + (p.korekta ? ' poprawiona' : '')}>
            <div class="pozycja-zakupow">
              <label class="pozycja-zaznacz">
                <input type="checkbox" checked=${!p.skreslona} onChange=${() => przelaczSkreslenie(p.klucz)} title="Odznacz, jeśli tego nie kupujecie (np. macie w domu)" />
                <span class="nazwa">${p.nazwa}</span>
              </label>
              <button class="ilosc ilosc-edytuj" title="Popraw ilość (np. część macie w domu)" onClick=${() => setEdytuj(edytuj === p.klucz ? null : p.klucz)}>${p.ilosc || '—'} <span class="olowek">✎</span></button>
            </div>
            <div class="pozycja-dodatki">
              ${p.korekta ? html`<span class="szczegoly">poprawione${p.korekta.mam ? ` (w domu: ${p.korekta.mam})` : ''}, wyliczone: ${p.wyliczona || '—'}</span>` : null}
              ${p.szczegoly ? html`<span class="szczegoly">${p.szczegoly}</span>` : null}
              ${p.zrodla.length ? html`<button class="przycisk-link maly" onClick=${() => setRozwin(rozwin === p.klucz ? null : p.klucz)}>${rozwin === p.klucz ? 'ukryj' : `z ${p.zrodla.length} ${p.zrodla.length === 1 ? 'dania' : 'dań'}`}</button>` : null}
              ${p.wlasna ? html`<button class="przycisk-link maly" onClick=${() => zm((pl) => { pl.lista.wlasne = pl.lista.wlasne.filter((x) => x.id !== p.id); })}>usuń</button>` : null}
            </div>
            ${p.korekta && p.nieaktualna ? html`<div class="ostrzezenie maly">Plan się zmienił od poprawki — teraz wychodzi <strong>${p.wyliczona || 'nic'}</strong>.
              <button class="przycisk przycisk-maly" onClick=${() => zm((pl) => { delete pl.lista.korekty[p.klucz]; })}>Użyj nowej ilości</button>
              <button class="przycisk przycisk-maly" onClick=${() => zm((pl) => { pl.lista.korekty[p.klucz].wyliczone = p.wyliczona; })}>Zostaw moją</button></div>` : null}
            ${edytuj === p.klucz ? html`<${EdycjaIlosci} poz=${p} onAnuluj=${() => setEdytuj(null)} onZapisz=${(nowa, mam) => { zapiszIlosc(p, nowa, mam); setEdytuj(null); }} />` : null}
            ${rozwin === p.klucz ? html`<div class="zrodla">
              <ul>${p.zrodla.map((z) => html`<li><span class="szary">${z.kiedy}</span> · ${z.przepis}${z.porcje ? ` (${naPorcji(z.porcje).replace(/^1 porcję$/, '1 porcja')})` : ''}: <strong>${z.ilosc}</strong></li>`)}</ul>
              ${!p.stala && !p.wlasna && d.produkty[p.klucz] ? html`<label class="przelacznik maly"><input type="checkbox" checked=${!!d.produkty[p.klucz].osobno}
                onChange=${(ev) => zmien((dd) => { if (ev.target.checked) dd.produkty[p.klucz].osobno = true; else dd.produkty[p.klucz].osobno = false; })} />
                Pokazuj osobno dla każdego dania (np. 300 g + 300 g — mięso mrożone w porcjach)</label>` : null}
            </div>` : null}
          </li>`)}</ul>
        </section>`)}
        ${wynik.pominiete.length ? html`<p class="szary maly">Nie pokazuję (ustawione w Produktach): ${wynik.pominiete.join(', ')}.</p>` : null}
      </div>
      <aside class="panel-boczny">
        <section>
          <h3>Dopisz do listy</h3>
          <label class="pole">Co<input value=${nowa.nazwa} onInput=${(ev) => setNowa({ ...nowa, nazwa: ev.target.value })} onKeyDown=${(ev) => { if (ev.key === 'Enter') dodajWlasna(); }} placeholder="np. kawa, płyn do naczyń" /></label>
          <label class="pole">Ile (opcjonalnie)<input value=${nowa.ilosc} onInput=${(ev) => setNowa({ ...nowa, ilosc: ev.target.value })} onKeyDown=${(ev) => { if (ev.key === 'Enter') dodajWlasna(); }} placeholder="np. 2 szt." /></label>
          <label class="pole">Dział<select value=${nowa.dzial} onChange=${(ev) => setNowa({ ...nowa, dzial: ev.target.value })}>${d.ustawienia.dzialy.map((x) => html`<option value=${x.id}>${x.nazwa}</option>`)}</select></label>
          <button class="przycisk przycisk-glowny" onClick=${dodajWlasna}>➕ Dopisz</button>
        </section>
        <section>
          <h3>Stałe zakupy</h3>
          ${(d.ustawienia.staleZakupy || []).length ? html`<ul class="lista-stalych">${d.ustawienia.staleZakupy.map((s) => html`<li><label class="przelacznik">
            <input type="checkbox" checked=${plan.lista?.stale?.includes(s.id)} onChange=${(ev) => zm((p) => { const st = new Set(p.lista.stale); if (ev.target.checked) st.add(s.id); else st.delete(s.id); p.lista.stale = [...st]; })} /> ${s.nazwa}${s.ilosc ? ` (${s.ilosc})` : ''}</label></li>`)}</ul>`
          : html`<p class="szary">Brak — dodasz je w Ustawieniach.</p>`}
          <button class="przycisk-link" onClick=${idzDoUstawien}>Edytuj listę stałych zakupów</button>
        </section>
      </aside>
    </div>
    ${qr ? html`<${QrModal} plan=${plan} wynik=${wynik} onZamknij=${() => setQr(false)} />` : null}
  </div>`;
}

// Poprawka ilości jednej pozycji: „mamy w domu” (odejmowanie) albo wpisana ręcznie ilość do kupienia
function EdycjaIlosci({ poz, onZapisz, onAnuluj }) {
  const baza = poz.wlasna ? poz.ilosc : poz.wyliczona;
  const daSieOdjac = !!rozbijIlosc(baza);
  const [mam, setMam] = useState(poz.korekta?.mam || '');
  const [reczna, setReczna] = useState(poz.korekta ? poz.korekta.ilosc : (poz.ilosc || ''));
  const poOdjeciu = mam ? odejmijIlosc(baza, mam) : null;
  const zapisz = () => {
    if (daSieOdjac && mam && poOdjeciu !== null) return onZapisz(poOdjeciu, mam);
    const t = reczna.trim();
    if (!poz.wlasna && t === (poz.wyliczona || '')) return onZapisz(null);
    onZapisz(t === '0' ? '' : t, null);
  };
  return html`<div class="edycja-ilosci" onKeyDown=${(ev) => { if (ev.key === 'Enter') zapisz(); if (ev.key === 'Escape') onAnuluj(); }}>
    ${!poz.wlasna ? html`<div>Z przepisów wychodzi: <strong>${poz.wyliczona || '—'}</strong></div>` : null}
    ${daSieOdjac ? html`<label class="pole-wiersz">Mamy w domu:
      <input type="text" inputmode="decimal" value=${mam} placeholder="np. 2" autoFocus onInput=${(ev) => setMam(ev.target.value)} />
      <span class="szary">${rozbijIlosc(baza).reszta}</span>
      ${mam ? html`<span>→ kupić: <strong>${poOdjeciu === '' ? 'nic (skreślę z listy)' : poOdjeciu ?? '?'}</strong></span>` : null}</label>` : null}
    <label class="pole-wiersz">${daSieOdjac ? 'albo wpisz, ile kupić:' : 'Ile kupić:'}
      <input type="text" value=${reczna} autoFocus=${!daSieOdjac} onInput=${(ev) => { setReczna(ev.target.value); setMam(''); }} placeholder="np. 4 szt." /></label>
    <div class="przyciski-wiersz">
      <button class="przycisk przycisk-glowny przycisk-maly" onClick=${zapisz}>Zapisz</button>
      ${poz.korekta ? html`<button class="przycisk przycisk-maly" onClick=${() => onZapisz(null)}>↺ Wróć do wyliczonej</button>` : null}
      <button class="przycisk przycisk-maly" onClick=${onAnuluj}>Anuluj</button>
    </div>
    <p class="podpowiedz">Poprawiona ilość trafi na wydruk i do kodu QR. Wpisz 0, jeśli nic nie trzeba kupować.</p>
  </div>`;
}

function svgQR(tekst) {
  const q = qrcode(0, 'L');
  q.addData(tekst, 'Byte');
  q.make();
  const n = q.getModuleCount(); const m = 4;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c + m} ${r + m}h1v1h-1z`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`, moduly: n };
}

function QrModal({ plan, wynik, onZamknij }) {
  const [linki, setLinki] = useState(null);
  const adres = new URL('lista.html', location.href.split('#')[0].split('?')[0]).href;
  useEffect(() => { linkiQR(plan, wynik, adres).then(setLinki); }, []);
  const lokalnie = location.protocol !== 'https:' || /localhost|127\.0\.0\.1/.test(location.hostname);
  return html`<${Modal} tytul="Lista na telefon" onZamknij=${onZamknij} szeroki>
    <p>Zeskanuj kod aparatem telefonu. Otworzy się lista do odhaczania w sklepie. Lista jest zapisana w samym kodzie — nic nie jest wysyłane na serwer.</p>
    ${lokalnie ? html`<p class="ostrzezenie">Program jest otwarty z komputera, a nie ze strony GitHub Pages — telefon nie otworzy takiego linku. Otwórz program z adresu GitHub Pages.</p>` : null}
    ${!linki ? html`<p>Przygotowuję kod…</p>` : html`<div class="kody-qr">${linki.map((l, i) => {
      const { svg } = svgQR(l);
      return html`<figure class="kod-qr">
        ${linki.length > 1 ? html`<figcaption>Część ${i + 1} z ${linki.length}</figcaption>` : null}
        <div class="qr-obraz" dangerouslySetInnerHTML=${{ __html: svg }}></div>
        <button class="przycisk przycisk-maly" onClick=${async () => { try { await navigator.clipboard.writeText(l); komunikat('Skopiowano link.'); } catch { komunikat('Nie udało się skopiować.', 'blad'); } }}>Kopiuj link</button>
      </figure>`;
    })}</div>`}
    ${linki && linki.length > 1 ? html`<p class="podpowiedz">Lista jest długa, więc podzieliłem ją na ${linki.length} kody. Każdy to osobna część listy.</p>` : null}
  <//>`;
}
