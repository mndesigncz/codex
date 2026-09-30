<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Nejsi připojený · {{NAZEV}}</title>
<!--
  Stránka, kterou nativní obal ukáže (server.errorPath), když se živý web
  nenačte při studeném startu bez sítě. Vzniká ze šablony skriptem
  apps/scripts/sync-www.mjs (název a adresa se berou z apps/apps.json).

  Všechno je tu natvrdo a v jednom souboru schválně: v tu chvíli nejde stáhnout
  ani styl, ani písmo. Prázdná obrazovka je horší než dinosaurus, protože
  nevysvětlí nic. Texty jsou česky a anglicky podle jazyka zařízení, protože
  rozhraní aplikace je zatím jen česky, ale telefon může být v angličtině.

  Text je poctivý: nic neslibuje o rozepsaném ani o offline režimu. V obalu
  žádný offline režim není, aplikace se načítá z internetu.
-->
<style>
  :root { --bg: #F1F3ED; --ink: #16181A; --lime: #C8F542; --surface: #FFFFFF; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14161A; --ink: #EDF2E4; --surface: #17191C; }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: var(--bg); color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center;
    padding: calc(24px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));
    -webkit-font-smoothing: antialiased;
  }
  .karta {
    width: 100%; max-width: 30rem; background: var(--surface);
    border: 1px solid rgba(127,127,127,0.16); border-radius: 28px; padding: 32px 28px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 18px 48px -20px rgba(0,0,0,0.25);
  }
  .znak {
    width: 56px; height: 56px; border-radius: 18px; background: var(--lime); color: #16181A;
    display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
  }
  h1 { font-size: 1.5rem; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 10px; }
  p { margin: 0 0 14px; font-size: 0.9375rem; line-height: 1.55; opacity: 0.72; }
  button {
    width: 100%; min-height: 48px; border: 0; border-radius: 999px; background: var(--lime); color: #16181A;
    font: inherit; font-size: 0.9375rem; font-weight: 600; cursor: pointer; margin-top: 8px;
  }
  button:active { transform: scale(0.98); }
  .stav { margin: 14px 0 0; text-align: center; font-size: 0.8125rem; opacity: 0.55; min-height: 1.2em; }
</style>
</head>
<body>
  <main class="karta">
    <div class="znak" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4.5 10.5a11 11 0 0 1 4.3-2.6" /><path d="M19.5 10.5a11 11 0 0 0-3.6-2.4" />
        <path d="M8 14a6 6 0 0 1 8 0" /><path d="M12 18.5h.01" /><path d="M3 3l18 18" />
      </svg>
    </div>
    <h1 id="nadpis">Nejsi připojený</h1>
    <p id="text">Spojení se ztratilo, takže se {{NAZEV}} nedá načíst. Aplikace se načítá z internetu. Není to chyba aplikace ani tvoje.</p>
    <button type="button" id="znovu">Zkusit znovu</button>
    <p class="stav" id="stav" role="status" aria-live="polite"></p>
  </main>
<script>
  // Splash má launchAutoHide vypnuté (schová ho až NativeBridge po vykreslení webu), takže offline stránka
  // ho musí schovat sama, jinak by obsluha viděla navždy jen splash.
  try { window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen && window.Capacitor.Plugins.SplashScreen.hide(); } catch (e) {}
  var START = '{{START_URL}}';
  var en = (navigator.language || '').toLowerCase().indexOf('cs') !== 0;
  var T = en ? {
    nadpis: 'You are offline',
    text: 'The connection was lost, so {{NAZEV}} cannot load. The app loads from the internet. This is not a fault of the app or of yours.',
    znovu: 'Try again',
    cekam: 'Still no signal. I will try again as soon as it returns.',
    nacitam: 'Loading…',
    zpet: 'Connection is back, loading…'
  } : {
    nadpis: 'Nejsi připojený',
    text: 'Spojení se ztratilo, takže se {{NAZEV}} nedá načíst. Aplikace se načítá z internetu. Není to chyba aplikace ani tvoje.',
    znovu: 'Zkusit znovu',
    cekam: 'Pořád bez signálu. Zkusím to sám, jakmile se vrátí.',
    nacitam: 'Načítám…',
    zpet: 'Spojení je zpátky, načítám…'
  };
  document.documentElement.lang = en ? 'en' : 'cs';
  document.getElementById('nadpis').textContent = T.nadpis;
  document.getElementById('text').textContent = T.text;
  document.getElementById('znovu').textContent = T.znovu;
  var stav = document.getElementById('stav');

  function zkusit() {
    // Tlačítko nesmí tvrdit, že se něco děje, když se neděje nic.
    if (navigator.onLine === false) { stav.textContent = T.cekam; return; }
    stav.textContent = T.nacitam;
    location.replace(START);
  }
  document.getElementById('znovu').addEventListener('click', zkusit);
  window.addEventListener('online', function () { stav.textContent = T.zpet; location.replace(START); });
  if (navigator.onLine === false) stav.textContent = T.cekam;
</script>
</body>
</html>
