/**
 * Double Slit — Homepage Server
 * Serves the one-page marketing site for the interactive 3D quantum experiment visualiser.
 */

const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const demoPath = path.join(__dirname, 'public', 'demo', 'index.html');
const publicPath = path.join(__dirname, 'public');

/** Avoid stale marketing HTML/JS in dev: static’s default index + ETag cache can skip showing loads in Network */
function noStoreHtmlJs(res, filePath) {
  if (/\.(html?|js|mjs)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  }
}

// Main route first — always fresh document (not served as cached static index)
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.use(
  express.static(publicPath, {
    index: false,
    setHeaders: noStoreHtmlJs,
  }),
);

// Demo — interactive simulation (with and without trailing slash)
app.get(['/demo', '/demo/'], (req, res) => {
  res.sendFile(demoPath);
});

app.get(['/demo/advanced', '/demo/advanced/'], (req, res) => {
  const q = req.url.indexOf('?');
  const qs = q >= 0 ? req.url.slice(q) : '';
  res.redirect(302, `/demo/${qs}`);
});

// Preview pages — standalone pages for each section
app.get('/preview/what', (req, res) => res.sendFile(path.join(__dirname, 'public', 'preview', 'what.html')));
app.get('/preview/who', (req, res) => res.sendFile(path.join(__dirname, 'public', 'preview', 'who.html')));
app.get('/preview/benefits', (req, res) => res.sendFile(path.join(__dirname, 'public', 'preview', 'benefits.html')));
app.get('/preview/features', (req, res) => res.sendFile(path.join(__dirname, 'public', 'preview', 'features.html')));

module.exports = app;

if (require.main === module) {
  const server = http.createServer(app);

  server.on('error', (err) => {
    console.error('Server error:', err.message);
    process.exit(1);
  });

  function onListening() {
    console.log(`Double Slit homepage running at http://localhost:${PORT}`);
    console.log(`Demo: http://localhost:${PORT}/demo`);
    console.log(`If "localhost" fails, use: http://127.0.0.1:${PORT}`);
  }

  /**
   * Bind IPv6 dual-stack (::, ipv6Only: false) so browsers resolving
   * "localhost" to ::1 (common on macOS) get a connection — fixes Chrome -102
   * (ERR_CONNECTION_REFUSED) when only 0.0.0.0 was bound.
   */
  server.listen({ port: PORT, host: '::', ipv6Only: false }, onListening);
}
