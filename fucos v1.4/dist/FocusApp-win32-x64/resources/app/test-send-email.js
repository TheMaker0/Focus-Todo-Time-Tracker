const http = require('http');

function postJson(url, data, timeout = 10000) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const payload = JSON.stringify(data || {});
      const opts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      const req = http.request(opts, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', d => buf += d);
        res.on('end', () => {
          try { const parsed = JSON.parse(buf || '{}'); resolve(parsed); }
          catch (e) { resolve({ raw: buf }); }
        });
      });
      req.on('error', (err) => reject(err));
      req.setTimeout(timeout, () => { req.destroy(new Error('Request timeout')); });
      req.write(payload);
      req.end();
    } catch (err) { reject(err); }
  });
}

(async () => {
  const url = 'http://localhost:3000/api/test-email';
  try {
    const res = await postJson(url, {});
    console.log('Response:', res);
    if (!res || res.ok !== true) process.exit(1);
  } catch (err) {
    console.error('Error calling test email endpoint:', err && err.message ? err.message : err);
    console.error('Make sure the server is running (run `node server.js` or `npm run start-server`).');
    process.exit(1);
  }
})();
