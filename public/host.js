'use strict';

// Host screen logic. Fetches the LAN address(es) from /api/hostinfo and renders
// the best join URL plus a client-side QR code (vendored qrcode-generator, no
// network call). Re-polls until a usable network address appears, so it works
// even if the hotspot/WiFi is turned on after the app launches.

function buildUrl(ip, port) { return 'http://' + ip + ':' + port; }

function renderQR(text) {
  const box = document.getElementById('qr');
  box.innerHTML = '';
  try {
    // typeNumber 0 = auto-size to fit the data; 'M' error correction.
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch (e) {
    box.textContent = 'Could not draw QR — use the address below.';
  }
}

function render(info) {
  const ips = (info && info.ips) || [];
  const port = (info && info.port) || 47800;
  const urlEl = document.getElementById('url');
  const altsEl = document.getElementById('alts');
  const nonet = document.getElementById('nonet');
  altsEl.innerHTML = '';

  if (ips.length === 0) {
    nonet.classList.remove('hidden');
    urlEl.textContent = 'Waiting for a network address…';
    document.getElementById('qr').textContent = '';
    return;
  }
  nonet.classList.add('hidden');

  const best = buildUrl(ips[0], port);
  urlEl.innerHTML = '<a href="' + best + '">' + best + '</a>';
  renderQR(best);

  if (ips.length > 1) {
    const head = document.createElement('li');
    head.textContent = 'If that address does not work, try:';
    altsEl.appendChild(head);
    for (const ip of ips.slice(1)) {
      const li = document.createElement('li');
      li.textContent = buildUrl(ip, port);
      altsEl.appendChild(li);
    }
  }
}

let lastKey = '';
async function poll() {
  try {
    const r = await fetch('/api/hostinfo', { cache: 'no-store' });
    const info = await r.json();
    const key = JSON.stringify(info);
    if (key !== lastKey) { lastKey = key; render(info); }
  } catch (e) {
    // server not ready yet, or briefly unreachable — try again shortly
  }
  setTimeout(poll, 2500);
}

document.getElementById('playBtn').onclick = function () { location.href = '/'; };
poll();
