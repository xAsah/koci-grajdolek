// Ustawienia: import przepisów, osoby i cele kcal, działy, stałe zakupy, kopie zapasowe, folder
import { html, useState, useEffect, useMemo, Modal, Potwierdz } from './wspolne.js';
import { stan, zmien, komunikat, wybierzFolder, podmienDane, zapiszTeraz, fs, ktoTo, ustawKtoTo, wymusKopie, odlozInnaWersje, czytajInnaWersje } from '../store.js';
import { importujPaczke } from '../importer.js';
import { uid, pobierzPlik, WERSJA, clone, dataPelna, isoDate } from '../util.js';
import { scalDane } from '../scal.js';

function kiedyTekst(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  return `${dataPelna(isoDate(t))}, ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

// Okno dołączania zmian z innego pliku danych (podgląd → potwierdzenie)
export function ScalModal({ ich, nazwa, wFolderze, onZamknij }) {
  const raport = useMemo(() => { try { return scalDane(clone(stan.dane), ich); } catch (e) { return { blad: String(e?.message || e) }; } }, []);
  const [trwa, setTrwa] = useState(false);
  const dolacz = async () => {
    setTrwa(true);
    try {
      wymusKopie(); // bieżąca wersja najpierw trafia do kopii
      zmien((dd) => { scalDane(dd, ich); });
      await zapiszTeraz(true);
      if (wFolderze) await odlozInnaWersje(nazwa);
      komunikat(`Dołączono zmiany z pliku ${nazwa}.${wFolderze ? ' Ten plik przeniosłem do podfolderu kopie.' : ''}`);
      onZamknij();
    } catch (e) { komunikat('Nie udało się: ' + (e?.message || e), 'blad'); setTrwa(false); }
  };
  const lista = (tytul, l, max = 12) => (l.length ? html`<li><strong>${tytul}: ${l.length}</strong>${l.length <= max ? html` — <span class="szary">${l.join(', ')}</span>` : html` — <span class="szary">${l.slice(0, max).join(', ')} i ${l.length - max} innych</span>`}</li>` : null);
  const ost = ich?.ostatniZapis;
  return html`<${Modal} tytul="Dołącz zmiany z innego pliku" szeroki onZamknij=${onZamknij} stopka=${html`<button class="przycisk" onClick=${onZamknij}>Anuluj</button>
    ${!raport.blad && raport.cokolwiek ? html`<button class="przycisk przycisk-glowny" disabled=${trwa} onClick=${dolacz}>Dołącz zmiany</button>` : null}
    ${!raport.blad && !raport.cokolwiek && wFolderze ? html`<button class="przycisk" disabled=${trwa} onClick=${async () => { await odlozInnaWersje(nazwa); komunikat('Plik przeniesiony do podfolderu kopie.'); onZamknij(); }}>Przenieś ten plik do kopii</button>` : null}`}>
    <p>Plik <strong>${nazwa}</strong>${ost?.kiedy ? html` — ostatnio zapisany ${kiedyTekst(ost.kiedy)}${ost.kto ? ` (${ost.kto})` : ''}` : null}.</p>
    ${raport.blad ? html`<p class="blad">${raport.blad}</p>` : !raport.cokolwiek ? html`<p>W tym pliku nie ma niczego, czego brakuje tutaj. Możesz go przenieść do kopii.</p>` : html`
      <p>Do Waszych danych zostanie dołączone:</p>
      <ul class="raport-scalenia">
        ${lista('Nowe plany', raport.planyNowe)}
        ${lista('Plany uzupełnione o dania', raport.planyUzupelnione)}
        ${lista('Przepisy zatwierdzone', raport.zatwierdzone)}
        ${lista('Przepisy przeniesione do kosza', raport.doKosza)}
        ${lista('Przepisy cofnięte do przejrzenia', raport.doPrzejrzenia)}
        ${lista('Przepisy poprawione', raport.zmienione)}
        ${lista('Nowe przepisy', raport.przepisyNowe)}
        ${lista('Nowe produkty', raport.produktyNowe)}
        ${lista('Ustawienia', raport.ustawienia)}
      </ul>
      <p class="podpowiedz">Przy przepisie, który zmieniano na obu komputerach, zostaje wersja zmieniona później. Nic nie jest usuwane, a obecne dane najpierw trafią do kopii zapasowej.</p>`}
  <//>`;
}

export function UstawieniaView({ d, idzDo }) {
  return html`<div class="widok-ustawien">
    <${Import} d=${d} idzDo=${idzDo} />
    <${Osoby} d=${d} />
    <${Dzialy} d=${d} />
    <${StaleZakupy} d=${d} />
    <${Kopie} d=${d} />
    <section class="karta"><h2>Folder z danymi i ten komputer</h2>
      <p>Dane są w folderze <strong>${stan.folderNazwa}</strong> (plik <code>dane.json</code>, kopie w podfolderze <code>kopie</code>, paczki do wczytania w <code>import</code>).</p>
      <p>Ostatni zapis: <strong>${d.ostatniZapis?.kiedy ? `${kiedyTekst(d.ostatniZapis.kiedy)}${d.ostatniZapis.kto ? ` — ${d.ostatniZapis.kto}` : ''}` : 'brak informacji'}</strong>. Liczba zapisów: ${d.licznik || 0}.</p>
      <label class="pole-wiersz">Na tym komputerze pracuje:
        <select value=${ktoTo() || ''} onChange=${(ev) => ustawKtoTo(ev.target.value || null)}>
          <option value="">— wybierz —</option>${d.ustawienia.osoby.map((o) => html`<option value=${o.id}>${o.imie}</option>`)}
        </select></label>
      <p class="podpowiedz">Dzięki temu na drugim komputerze widać, kto i kiedy ostatnio coś zapisał — łatwo sprawdzić, czy OneDrive przesłał zmiany. Na obu komputerach musi być wskazany ten sam folder w OneDrive.</p>
      <button class="przycisk" onClick=${wybierzFolder}>📁 Wskaż inny folder</button>
    </section>
    <section class="karta"><h2>O programie</h2>
      <p>Koci Grajdołek, wersja ${WERSJA}${fs.trybTestowy ? ' — TRYB TESTOWY (dane w przeglądarce, nie na dysku)' : ''}.</p>
      <p class="szary maly">Strona listy na telefon: ${new URL('lista.html', location.href.split('#')[0].split('?')[0]).href}</p>
    </section>
  </div>`;
}

function Import({ d, idzDo }) {
  const [pliki, setPliki] = useState(null);
  const [wynik, setWynik] = useState(null);
  const [trwa, setTrwa] = useState(false);
  const odswiez = async () => { const { pliki: p } = await fs.plikiImportu(stan.folder); setPliki(p); };
  useEffect(() => { odswiez(); }, []);
  const wczytajTeksty = async (lista) => {
    setTrwa(true);
    const raporty = [];
    // słownik produktów zawsze pierwszy
    lista.sort((a, b) => (/slownik/i.test(b.nazwa) ? 1 : 0) - (/slownik/i.test(a.nazwa) ? 1 : 0));
    for (const { nazwa, tekst } of lista) {
      try {
        const json = JSON.parse(tekst);
        let r;
        zmien((dd) => { r = importujPaczke(dd, json); const ost = dd.importy[dd.importy.length - 1]; if (ost) ost.plik = nazwa; });
        raporty.push({ nazwa, ...r });
      } catch (e) { raporty.push({ nazwa, blad: String(e?.message || e) }); }
    }
    await zapiszTeraz();
    setTrwa(false);
    setWynik(raporty);
  };
  const zFolderu = async (tylko) => {
    const { folder, pliki: p } = await fs.plikiImportu(stan.folder);
    const lista = [];
    for (const x of p) if (!tylko || tylko === x.nazwa) lista.push({ nazwa: x.nazwa, tekst: (await fs.czytajPlik(folder, x.nazwa)).tekst });
    await wczytajTeksty(lista);
  };
  const zDysku = async (ev) => {
    const lista = [];
    for (const f of ev.target.files) lista.push({ nazwa: f.name, tekst: await f.text() });
    ev.target.value = '';
    await wczytajTeksty(lista);
  };
  const wczytane = new Set(d.importy.map((i) => i.plik).filter(Boolean));
  return html`<section class="karta"><h2>Import przepisów</h2>
    <p>Paczki przepisów przygotowuje Claude (z Twoich PDF-ów). Wrzuć je do podfolderu <code>import</code> w folderze danych albo wskaż plik ręcznie. Najpierw wczytaj <strong>słownik produktów</strong>, potem paczki — przycisk „Wczytaj wszystkie” robi to w dobrej kolejności. Przepisy trafią do zakładki <strong>Przepisy → Do przejrzenia</strong>.</p>
    ${pliki === null ? html`<p>Sprawdzam folder import…</p>` : pliki.length === 0 ? html`<p class="szary">W folderze <code>import</code> nie ma plików .json.</p>` : html`
      <table class="tab-importu"><tbody>${pliki.map((p) => html`<tr><td>${p.nazwa}</td><td class="szary">${(p.rozmiar / 1024).toFixed(0)} KB</td><td>${wczytane.has(p.nazwa) ? '✔ wczytany' : ''}</td>
        <td><button class="przycisk przycisk-maly" disabled=${trwa} onClick=${() => zFolderu(p.nazwa)}>Wczytaj</button></td></tr>`)}</tbody></table>
      <button class="przycisk przycisk-glowny" disabled=${trwa} onClick=${() => zFolderu(null)}>⬇ Wczytaj wszystkie z folderu import</button>`}
    <span class="odstep-poziomy"></span>
    <label class="przycisk">📄 Wczytaj z pliku…<input type="file" accept=".json,application/json" multiple hidden onChange=${zDysku} /></label>
    <button class="przycisk-link" onClick=${odswiez}>odśwież listę</button>
    ${trwa ? html`<p>Wczytuję…</p>` : null}
    ${wynik ? html`<${Modal} tytul="Wynik importu" szeroki onZamknij=${() => setWynik(null)} stopka=${html`<button class="przycisk" onClick=${() => setWynik(null)}>Zamknij</button><button class="przycisk przycisk-glowny" onClick=${() => { setWynik(null); idzDo('przepisy'); }}>Przejdź do przeglądu przepisów</button>`}>
      <ul class="wyniki-importu">${wynik.map((r) => html`<li>
        <strong>${r.nazwa}</strong>: ${r.blad ? html`<span class="blad">błąd — ${r.blad}</span>`
        : r.typ === 'slownik' ? `słownik: dodano ${r.dodane} produktów${r.scalone?.length ? `, ${r.scalone.length} dopisano do istniejących` : ''}`
        : html`dodano ${r.dodane}, zaktualizowano ${r.zaktualizowane}, pominięto ${r.pominiete} (już przejrzane lub poprawione)${r.noweProdukty ? html`, <strong>${r.noweProdukty} nowych produktów do sprawdzenia</strong>` : ''}; raport scaleń: ${r.raportScalen?.length || 0} nazw`}
      </li>`)}</ul>
      ${wynik.some((r) => r.noweProdukty) ? html`<p class="ostrzezenie">Są nowe produkty, których słownik nie znał — sprawdź je w <button class="przycisk-link" onClick=${() => { setWynik(null); idzDo('produkty'); }}>Produkty → Nowe produkty</button>.</p>` : null}
    <//>` : null}
  </section>`;
}

function Osoby({ d }) {
  const pole = (i, klucz, placeholder) => html`<td><input type="number" min="0" step=${klucz === 'celKcal' ? 10 : 1} value=${d.ustawienia.osoby[i][klucz] ?? ''} placeholder=${placeholder}
    onChange=${(ev) => zmien((dd) => { const v = Number(ev.target.value); dd.ustawienia.osoby[i][klucz] = v > 0 ? v : null; })} /></td>`;
  return html`<section class="karta"><h2>Osoby i dzienne cele</h2>
    <table class="tab-osob"><thead><tr><th>Imię</th><th>kcal / dzień</th><th>Białko (g)</th><th>Tłuszcz (g)</th><th>Węglowodany (g)</th></tr></thead><tbody>
      ${d.ustawienia.osoby.map((o, i) => html`<tr>
        <td><input value=${o.imie} onChange=${(ev) => zmien((dd) => { dd.ustawienia.osoby[i].imie = ev.target.value.trim() || o.imie; })} /></td>
        ${pole(i, 'celKcal', 'brak')}${pole(i, 'celB', 'brak')}${pole(i, 'celT', 'brak')}${pole(i, 'celW', 'brak')}
      </tr>`)}
    </tbody></table>
    <p class="podpowiedz">W planie przy każdym dniu zobaczysz sumy i porównanie z celami. „Zaproponuj dla pustych” dobiera dania tak, żeby dzień był jak najbliżej celu kalorii (i makro, jeśli je wpiszesz). Puste pole = brak celu.</p>
  </section>`;
}

function Dzialy({ d }) {
  const [nowy, setNowy] = useState('');
  const uzywane = new Set([...Object.values(d.produkty).map((p) => p.dzial), ...(d.ustawienia.staleZakupy || []).map((s) => s.dzial)]);
  const przesun = (i, o) => zmien((dd) => { const l = dd.ustawienia.dzialy; const j = i + o; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; });
  return html`<section class="karta"><h2>Działy sklepu (kolejność na liście zakupów)</h2>
    <p class="podpowiedz">Ustaw kolejność tak, jak idziecie przez Auchan — lista zakupów i wydruk będą w tej kolejności.</p>
    <ol class="lista-dzialow">${d.ustawienia.dzialy.map((dz, i) => html`<li>
      <input value=${dz.nazwa} onChange=${(ev) => zmien((dd) => { dd.ustawienia.dzialy[i].nazwa = ev.target.value.trim() || dz.nazwa; })} />
      <button class="przycisk-ikona" title="Wyżej" disabled=${i === 0} onClick=${() => przesun(i, -1)}>▲</button>
      <button class="przycisk-ikona" title="Niżej" disabled=${i === d.ustawienia.dzialy.length - 1} onClick=${() => przesun(i, 1)}>▼</button>
      ${!uzywane.has(dz.id) && dz.id !== 'inn' ? html`<button class="przycisk-ikona" title="Usuń dział" onClick=${() => zmien((dd) => { dd.ustawienia.dzialy.splice(i, 1); })}>✕</button>` : null}
    </li>`)}</ol>
    <div class="wiersz-pol"><input placeholder="nowy dział…" value=${nowy} onInput=${(ev) => setNowy(ev.target.value)} />
      <button class="przycisk" onClick=${() => { if (nowy.trim()) { zmien((dd) => dd.ustawienia.dzialy.push({ id: 'dz-' + uid().slice(-6), nazwa: nowy.trim() })); setNowy(''); } }}>Dodaj dział</button></div>
  </section>`;
}

function StaleZakupy({ d }) {
  const [f, setF] = useState({ nazwa: '', ilosc: '', dzial: 'che' });
  const dodaj = () => { if (!f.nazwa.trim()) return; zmien((dd) => dd.ustawienia.staleZakupy.push({ id: 'stale-' + uid().slice(-8), nazwa: f.nazwa.trim(), ilosc: f.ilosc.trim(), dzial: f.dzial })); setF({ ...f, nazwa: '', ilosc: '' }); };
  return html`<section class="karta"><h2>Stałe zakupy</h2>
    <p class="podpowiedz">Rzeczy spoza przepisów, które często kupujecie. Na liście zakupów odhaczasz je jednym kliknięciem.</p>
    <table class="tab-stalych"><tbody>${(d.ustawienia.staleZakupy || []).map((s, i) => html`<tr>
      <td><input value=${s.nazwa} onChange=${(ev) => zmien((dd) => { dd.ustawienia.staleZakupy[i].nazwa = ev.target.value; })} /></td>
      <td><input value=${s.ilosc || ''} placeholder="ilość" onChange=${(ev) => zmien((dd) => { dd.ustawienia.staleZakupy[i].ilosc = ev.target.value; })} /></td>
      <td><select value=${s.dzial} onChange=${(ev) => zmien((dd) => { dd.ustawienia.staleZakupy[i].dzial = ev.target.value; })}>${d.ustawienia.dzialy.map((x) => html`<option value=${x.id}>${x.nazwa}</option>`)}</select></td>
      <td><button class="przycisk-ikona" title="Usuń" onClick=${() => zmien((dd) => { dd.ustawienia.staleZakupy.splice(i, 1); })}>✕</button></td>
    </tr>`)}</tbody></table>
    <div class="wiersz-pol">
      <input placeholder="np. papier toaletowy" value=${f.nazwa} onInput=${(ev) => setF({ ...f, nazwa: ev.target.value })} onKeyDown=${(ev) => { if (ev.key === 'Enter') dodaj(); }} />
      <input placeholder="ilość (opcjonalnie)" value=${f.ilosc} onInput=${(ev) => setF({ ...f, ilosc: ev.target.value })} />
      <select value=${f.dzial} onChange=${(ev) => setF({ ...f, dzial: ev.target.value })}>${d.ustawienia.dzialy.map((x) => html`<option value=${x.id}>${x.nazwa}</option>`)}</select>
      <button class="przycisk" onClick=${dodaj}>Dodaj</button>
    </div>
  </section>`;
}

function Kopie({ d }) {
  const [kopie, setKopie] = useState(null);
  const [przywroc, setPrzywroc] = useState(null);
  const [scal, setScal] = useState(null);
  const plikDoScalenia = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try { setScal({ nazwa: f.name, ich: JSON.parse(await f.text()), wFolderze: false }); }
    catch (e) { komunikat('To nie jest poprawny plik danych: ' + (e?.message || e), 'blad'); }
  };
  const odswiez = async () => setKopie(await fs.listaKopii(stan.folder));
  useEffect(() => { odswiez(); }, [stan.zapis === 'zapisano']);
  const wczytajPlik = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try { const json = JSON.parse(await f.text()); setPrzywroc({ nazwa: f.name, json }); }
    catch (e) { komunikat('To nie jest poprawny plik danych: ' + (e?.message || e), 'blad'); }
  };
  return html`<section class="karta"><h2>Kopie zapasowe</h2>
    <p class="podpowiedz">Przed zapisem program robi kopię poprzedniej wersji (najwyżej co 5 minut). Zostaje 30 ostatnich kopii i po jednej z każdego dnia (60 dni).</p>
    <div class="przyciski-wiersz">
      <button class="przycisk" onClick=${() => pobierzPlik(`koci-grajdolek-kopia-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 1))}>💾 Zapisz kopię na dysk</button>
      <label class="przycisk">📂 Wczytaj kopię z pliku…<input type="file" accept=".json" hidden onChange=${wczytajPlik} /></label>
      <label class="przycisk" title="Np. dane z drugiego komputera: dołącza plany, zatwierdzenia i poprawki przepisów, niczego nie usuwając">🔀 Dołącz zmiany z innego pliku…<input type="file" accept=".json" hidden onChange=${plikDoScalenia} /></label>
    </div>
    ${stan.inneWersje.length ? html`<div class="ostrzezenie"><strong>W folderze danych jest druga wersja danych:</strong>
      <ul>${stan.inneWersje.map((p) => html`<li>${p.nazwa} <span class="szary">(zmieniony ${kiedyTekst(new Date(p.zmieniono).toISOString())})</span>
        <button class="przycisk przycisk-maly" onClick=${async () => { try { setScal({ nazwa: p.nazwa, ich: await czytajInnaWersje(p.nazwa), wFolderze: true }); } catch (e) { komunikat(String(e?.message || e), 'blad'); } }}>Dołącz zmiany z tego pliku</button></li>`)}</ul></div>` : null}
    ${scal ? html`<${ScalModal} ...${scal} onZamknij=${() => setScal(null)} />` : null}
    ${kopie === null ? html`<p>Wczytuję listę kopii…</p>` : kopie.length === 0 ? html`<p class="szary">Jeszcze nie ma kopii.</p>` : html`<details><summary>Kopie w folderze (${kopie.length})</summary>
      <table class="tab-kopii"><tbody>${kopie.map((k) => html`<tr><td>${k.nazwa.replace('dane-', '').replace('.json', '').replace('_', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2')}</td><td class="szary">${(k.rozmiar / 1024).toFixed(0)} KB</td>
        <td><button class="przycisk przycisk-maly" onClick=${async () => setPrzywroc({ nazwa: k.nazwa, json: JSON.parse(await fs.czytajKopie(stan.folder, k.nazwa)) })}>Przywróć</button></td></tr>`)}</tbody></table></details>`}
    ${przywroc ? html`<${Potwierdz} tytul="Przywrócić kopię?" tekst=${`Obecne dane zostaną zastąpione kopią „${przywroc.nazwa}”. Bieżąca wersja trafi najpierw do kopii zapasowych, więc można to cofnąć.`} tak="Przywróć"
      onNie=${() => setPrzywroc(null)} onTak=${async () => { try { await podmienDane(przywroc.json); komunikat('Przywrócono kopię.'); } catch (e) { komunikat(String(e?.message || e), 'blad'); } setPrzywroc(null); odswiez(); }} />` : null}
  </section>`;
}
