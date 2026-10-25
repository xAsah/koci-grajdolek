// Start programu
import { html, render } from '../vendor/preact-htm.mjs';
import { App } from './ui/app.js';
import { start } from './store.js';
import { trybTestowy } from './fs.js';

if ('serviceWorker' in navigator && !trybTestowy && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const mialKontroler = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* bez trybu offline */ });
  // po wgraniu nowej wersji na GitHub: nowy service worker przejmuje stronę -> proponujemy odświeżenie
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!mialKontroler || document.getElementById('nowa-wersja')) return;
    const b = document.createElement('div');
    b.id = 'nowa-wersja'; b.className = 'baner-nowa-wersja';
    b.innerHTML = 'Jest nowa wersja programu. <button class="przycisk przycisk-glowny">Odśwież teraz</button>';
    b.querySelector('button').addEventListener('click', async () => {
      const { zapiszTeraz } = await import('./store.js');
      await zapiszTeraz();
      location.reload();
    });
    document.body.appendChild(b);
  });
}

render(html`<${App} />`, document.getElementById('app'));
start();
