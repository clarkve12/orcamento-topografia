/* SANTEX Gestão — app instalável e funcionamento com sinal fraco.
   - App (página, logos, bibliotecas): busca na internet e guarda a última versão; sem internet, usa a guardada.
   - Imagens do mapa: guarda as que você já viu (até ~3.000) para abrir mais rápido e sem sinal.
   - Rota (OSRM) e busca de lugares precisam de internet e não são guardadas. */
var SHELL = 'sx-app-v12';
var TILES = 'sx-mapa-v1';
var MAX_TILES = 3000;
var SHELL_URLS = ['./', './index.html', './manifest.json', './financeiro.js', 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  './assets/logo-escuro.jpg', './assets/logo-claro.jpg', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-180.png', './assets/icon-maskable-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'];

function isTile(url){ return /\/MapServer\/tile\/\d+\/\d+\/\d+/.test(url) || /tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png/.test(url); }
function isLib(url){ return /^https:\/\/(unpkg\.com|cdnjs\.cloudflare\.com|www\.gstatic\.com|fonts\.(googleapis|gstatic)\.com)\//.test(url); }

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(SHELL).then(function(c){
    return Promise.all(SHELL_URLS.map(function(u){ return c.add(new Request(u, {mode: u.indexOf('http')===0 ? 'cors' : 'same-origin'})).catch(function(){}); }));
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k.indexOf('sx-')===0 && k!==SHELL && k!==TILES; }).map(function(k){ return caches.delete(k); })); })
    .then(function(){ return self.clients.claim(); }));
});

var trimming = false;
function trim(){ if(trimming) return; trimming = true;
  caches.open(TILES).then(function(c){ return c.keys().then(function(ks){
    var extra = ks.length - MAX_TILES; if(extra <= 0) return;
    return Promise.all(ks.slice(0, extra + 100).map(function(k){ return c.delete(k); }));
  }); }).then(function(){ trimming = false; }, function(){ trimming = false; });
}

self.addEventListener('fetch', function(e){
  var req = e.request; if(req.method !== 'GET') return;
  var url = req.url;

  if(isTile(url)){
    var key = url.split('?')[0];
    e.respondWith(caches.open(TILES).then(function(c){
      return c.match(key).then(function(hit){
        var net = fetch(req).then(function(res){ if(res && res.ok && res.type !== 'opaque'){ c.put(key, res.clone()).then(trim); } return res; },
          function(){ return hit || new Response('', {status: 504, statusText: 'offline'}); });
        if(hit){ net.catch(function(){}); return hit; }
        return net;
      });
    }));
    return;
  }

  var sameOrigin = url.indexOf(self.location.origin) === 0;
  if(req.mode === 'navigate' || sameOrigin || isLib(url)){
    // Rede primeiro (versão mais nova); se não responder em 4 s ou sem internet, usa a cópia salva.
    var cacheKey = req.mode === 'navigate' ? './index.html' : req;
    var fromCache = function(){ return caches.open(SHELL).then(function(c){ return c.match(cacheKey, {ignoreSearch: true}); }); };
    var timed = new Promise(function(res){ setTimeout(function(){ fromCache().then(function(r){ if(r) res(r); }); }, 4000); });
    e.respondWith(Promise.race([timed,
      fetch(req).then(function(res){
        if(res && (res.ok || res.type === 'opaque')){ var cp = res.clone(); caches.open(SHELL).then(function(c){ c.put(cacheKey, cp); }); }
        return res;
      }).catch(function(){ return fromCache().then(function(r){ return r || Response.error(); }); })
    ]));
  }
});
