// #229 runtime probe: does session.setUserAgent on a persist partition apply to
// page requests, service-worker script fetches, and SW-initiated fetches?
const { app, session, BrowserWindow } = require('electron');
const http = require('http');

const seen = {};
const server = http.createServer((req, res) => {
    seen[req.url] = {
        ua: req.headers['user-agent'] || '',
        lang: req.headers['accept-language'] || '',
    };
    if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><script>
            navigator.serviceWorker.register('/sw.js').catch(e => console.error(e));
        </script>ok`);
    } else if (req.url === '/sw.js') {
        res.setHeader('Content-Type', 'application/javascript');
        res.end(`self.addEventListener('install', (e) => {
            e.waitUntil(fetch('/sw-fetch').then(() => self.skipWaiting()));
        });`);
    } else {
        res.end('ok');
    }
});

function cleanUA() {
    const chromeVersion = process.versions.chrome;
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

app.whenReady().then(() => {
    server.listen(0, '127.0.0.1', async () => {
        const port = server.address().port;
        const ses = session.fromPartition('persist:ua-probe-229');
        const ua = cleanUA();
        ses.setUserAgent(ua, 'ko-KR,ko,en-US,en');
        ses.webRequest.onBeforeSendHeaders((details, callback) => {
            details.requestHeaders['User-Agent'] = ua;
            callback({ requestHeaders: details.requestHeaders });
        });
        const win = new BrowserWindow({
            show: false,
            webPreferences: { partition: 'persist:ua-probe-229', sandbox: true, contextIsolation: true, nodeIntegration: false },
        });
        await win.loadURL(`http://127.0.0.1:${port}/`);
        setTimeout(() => {
            const expected = cleanUA();
            const results = {};
            let pass = true;
            for (const path of ['/', '/sw.js', '/sw-fetch']) {
                const r = seen[path];
                if (!r) { results[path] = 'MISSING'; pass = false; continue; }
                const uaClean = r.ua === expected && !/electron|podex/i.test(r.ua);
                const langOk = r.lang.startsWith('ko-KR');
                results[path] = { uaClean, langOk, ua: r.ua, lang: r.lang };
                if (!uaClean || !langOk) pass = false;
            }
            console.log('PROBE_RESULTS ' + JSON.stringify(results, null, 1));
            console.log(pass ? 'PROBE_PASS' : 'PROBE_FAIL');
            app.exit(pass ? 0 : 1);
        }, 3000);
    });
});

