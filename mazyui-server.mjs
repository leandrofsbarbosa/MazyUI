// ============================================================
// MazyUI painel — servidor local
//   - Serve a UI estática
//   - Lê/grava os arquivos do workspace
//   - Spawna o Claude Code (instalado localmente em .mazyui-runtime)
//     com streaming JSON e devolve via SSE
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { brand } from './brand.config.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.join(ROOT, '.mazyui-runtime');
const PORT = Number(process.env.MAZYUI_PORT || 7777);
const IS_WIN = process.platform === 'win32';

// ============================================================
// Brand: substitui placeholders {{BRAND_*}} no HTML antes de servir
// ============================================================
function renderBrand(html) {
  return html
    .replaceAll('{{BRAND_NAME}}',      brand.name)
    .replaceAll('{{BRAND_TITLE}}',     brand.title)
    .replaceAll('{{BRAND_AUTHORS}}',   brand.authors)
    .replaceAll('{{BRAND_MARK_HTML}}', brand.markHtml)
    .replaceAll('{{BRAND_WELCOME}}',   brand.welcome);
}

// ============================================================
// Bootstrap: garante o Claude Code instalado localmente
// ============================================================
function resolveClaudeEntry() {
  const pkgDir = path.join(RUNTIME_DIR, 'node_modules', '@anthropic-ai', 'claude-code');
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  let binRel = null;
  if (typeof pkg.bin === 'string') binRel = pkg.bin;
  else if (pkg.bin && pkg.bin.claude) binRel = pkg.bin.claude;
  if (!binRel) return null;
  const entry = path.join(pkgDir, binRel);
  return fs.existsSync(entry) ? entry : null;
}

async function ensureClaudeCode() {
  let entry = resolveClaudeEntry();
  if (entry) return entry;

  console.log('[mazyui] Primeira execução — instalando Claude Code localmente…');
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const pkgPath = path.join(RUNTIME_DIR, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify({
      name: 'mazyui-runtime',
      private: true,
      version: '0.0.1',
    }, null, 2));
  }
  await new Promise((resolve, reject) => {
    const npmCmd = IS_WIN ? 'npm.cmd' : 'npm';
    const proc = spawn(npmCmd, [
      'install',
      '@anthropic-ai/claude-code',
      '--no-audit', '--no-fund', '--loglevel=error',
    ], { cwd: RUNTIME_DIR, stdio: 'inherit', shell: IS_WIN });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error('npm install falhou: ' + code)));
    proc.on('error', reject);
  });
  entry = resolveClaudeEntry();
  if (!entry) throw new Error('Claude Code instalou mas o entry JS não foi encontrado em ' + RUNTIME_DIR);
  console.log('[mazyui] Pronto.');
  return entry;
}

// ============================================================
// Sistema de arquivos — leitura/escrita segura dentro do workspace
// ============================================================
function safeResolve(rel) {
  const abs = path.resolve(ROOT, rel || '');
  if (!abs.startsWith(ROOT)) throw new Error('Path fora do workspace');
  return abs;
}

function readSafe(rel) {
  try { return fs.readFileSync(safeResolve(rel), 'utf8'); }
  catch { return ''; }
}

const FORMAT_DIRS = ['instagram', 'quadrado', 'stories', 'horizontal', 'vertical', 'pinterest', 'classico', 'link-card'];

function scanLibrary() {
  const dir = path.join(ROOT, 'marketing', 'conteudo');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => {
      try { return fs.statSync(path.join(dir, name)).isDirectory(); }
      catch { return false; }
    })
    .map(name => {
      const itemDir = path.join(dir, name);
      const formats = {};
      for (const fmt of FORMAT_DIRS) {
        const fmtDir = path.join(itemDir, fmt);
        if (!fs.existsSync(fmtDir)) continue;
        try {
          const pngs = fs.readdirSync(fmtDir).filter(f => /\.png$/i.test(f)).sort();
          if (pngs.length) {
            const rel = path.relative(ROOT, fmtDir).replace(/\\/g, '/');
            formats[fmt] = { slides: pngs.map(f => `${rel}/${f}`), folder: rel };
          }
        } catch {}
      }
      const relItem = path.relative(ROOT, itemDir).replace(/\\/g, '/');
      let rootPngs = [];
      try {
        rootPngs = fs.readdirSync(itemDir).filter(f => /\.png$/i.test(f)).sort();
      } catch {}
      const primaryFmt = formats.instagram ? 'instagram' : Object.keys(formats)[0] || null;
      const slides = primaryFmt ? formats[primaryFmt].slides : rootPngs.map(f => `${relItem}/${f}`);
      const folder = primaryFmt ? formats[primaryFmt].folder : relItem;
      const captionPath = `${relItem}/legenda.md`;
      const captionLinkedinPath = `${relItem}/legenda-linkedin.md`;
      const readMaybe = (rel) => {
        try {
          const abs = path.join(ROOT, rel);
          return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
        } catch { return null; }
      };
      const caption = readMaybe(captionPath);
      const captionLinkedin = readMaybe(captionLinkedinPath);
      return {
        name, folder, slides, formats,
        itemFolder: relItem,
        captionPath, caption,
        captionLinkedinPath, captionLinkedin,
      };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

// ============================================================
// HTTP helpers
// ============================================================
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function text(res, status, body, ct = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': ct,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
};

// ============================================================
// Handlers
// ============================================================
function handleState(req, res) {
  const logoAbs = path.join(ROOT, 'identidade', 'logo.svg');
  let logo = null;
  if (fs.existsSync(logoAbs)) {
    try {
      const st = fs.statSync(logoAbs);
      logo = { path: 'identidade/logo.svg', size: st.size, mtime: st.mtimeMs };
    } catch {}
  }
  const state = {
    folderName: path.basename(ROOT),
    memory: {
      empresa:      readSafe('_memoria/empresa.md'),
      preferencias: readSafe('_memoria/preferencias.md'),
      estrategia:   readSafe('_memoria/estrategia.md'),
    },
    identidade: readSafe('identidade/design-guide.md'),
    library: scanLibrary(),
    logo,
  };
  json(res, 200, state);
}

async function handleSave(req, res) {
  try {
    const body = await readBody(req);
    const { path: rel, content } = JSON.parse(body);
    if (!rel || typeof content !== 'string') {
      return json(res, 400, { error: 'path e content obrigatórios' });
    }
    const abs = safeResolve(rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    json(res, 200, { ok: true });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}

async function handleDeleteFile(req, res) {
  try {
    const { path: rel } = JSON.parse(await readBody(req));
    if (!rel) return json(res, 400, { error: 'path obrigatório' });
    const abs = safeResolve(rel);
    if (!fs.existsSync(abs)) return json(res, 404, { error: 'arquivo não existe' });
    const st = fs.statSync(abs);
    if (!st.isFile()) return json(res, 400, { error: 'só remove arquivos' });
    fs.unlinkSync(abs);
    json(res, 200, { ok: true });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}

function handleFile(req, res, url) {
  try {
    const rel = url.searchParams.get('path');
    if (!rel) return text(res, 400, 'falta path');
    const abs = safeResolve(rel);
    if (!fs.existsSync(abs)) return text(res, 404, 'não encontrado');
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(abs).pipe(res);
  } catch (e) {
    text(res, 500, String(e.message || e));
  }
}

let CLAUDE_ENTRY = null;
const activeRuns = new Map();   // runId -> child process

async function handleRun(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { return json(res, 400, { error: 'JSON inválido' }); }
  const { prompt, runId, continueSession, model } = body;
  if (!prompt || !runId) return json(res, 400, { error: 'prompt e runId obrigatórios' });

  if (!CLAUDE_ENTRY) {
    try { CLAUDE_ENTRY = await ensureClaudeCode(); }
    catch (e) { return json(res, 500, { error: 'Setup falhou: ' + e.message }); }
  }

  // SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  };

  send('boot', { ok: true });

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
  ];
  if (continueSession) args.push('--continue');
  if (model && /^[a-z0-9._-]+$/i.test(model)) args.push('--model', model);
  // Sem shell — shell:true no Windows reconstrói o comando via cmd.exe e
  // quebra args com newline. Spawnar o entry direto (seja .exe nativo ou
  // arquivo JS) preserva os args como estão.
  const isExe = /\.exe$/i.test(CLAUDE_ENTRY);
  const cmd = isExe ? CLAUDE_ENTRY : process.execPath;
  const finalArgs = isExe ? args : [CLAUDE_ENTRY, ...args];
  const proc = spawn(cmd, finalArgs, {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  activeRuns.set(runId, proc);

  let stdoutBuf = '';
  proc.stdout.on('data', chunk => {
    stdoutBuf += chunk.toString('utf8');
    let nl;
    while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (line) send('event', line);
    }
  });
  proc.stderr.on('data', chunk => {
    send('stderr', chunk.toString('utf8'));
  });
  proc.on('close', code => {
    if (stdoutBuf.trim()) send('event', stdoutBuf.trim());
    send('done', { exitCode: code });
    res.end();
    activeRuns.delete(runId);
  });
  proc.on('error', err => {
    send('stderr', 'Erro spawning Claude: ' + err.message);
    send('done', { exitCode: -1 });
    res.end();
    activeRuns.delete(runId);
  });

  req.on('close', () => {
    if (!proc.killed) proc.kill();
    activeRuns.delete(runId);
  });
}

async function handleCancel(req, res) {
  try {
    const { runId } = JSON.parse(await readBody(req));
    const proc = activeRuns.get(runId);
    if (proc && !proc.killed) {
      proc.kill();
      activeRuns.delete(runId);
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'run não encontrado' });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}

function handleShutdown(req, res) {
  json(res, 200, { ok: true });
  setTimeout(() => process.exit(0), 200);
}

function handleRestart(req, res) {
  // Dispara um cmd/sh em background que aguarda 2s (tempo do processo atual
  // sair + liberar a porta) e então sobe um novo `node mazyui-server.mjs`.
  // Em seguida mata o processo atual.
  try {
    const serverFile = path.join(ROOT, 'mazyui-server.mjs');
    if (IS_WIN) {
      // `start "" /min cmd /c ...` desanexa de vez do processo pai
      const cmdLine = `start "" /min cmd /c "timeout /t 2 /nobreak >nul & cd /d "${ROOT}" & node "${serverFile}""`;
      spawn('cmd.exe', ['/c', cmdLine], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } else {
      const shellCmd = `sleep 2 && cd "${ROOT}" && node "${serverFile}"`;
      spawn('sh', ['-c', shellCmd], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
    json(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 200);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}

// ============================================================
// Snapshot / restore — protege slides irmãos de edição acidental
// ============================================================
const SNAPSHOT_ROOT = path.join(RUNTIME_DIR, 'slide-snapshots');
// Slides que entraram em edição nesta sessão do servidor. Restore nunca
// sobrescreve esses, mesmo que tenham mudado em relação ao snapshot — a
// mudança veio de outra run paralela (intencional), não de scribbling.
const intentionallyEditedSlides = new Set();

async function handleSnapshotSiblings(req, res) {
  try {
    const { targetPath, runId } = JSON.parse(await readBody(req));
    if (!targetPath || !runId) return json(res, 400, { error: 'targetPath e runId obrigatórios' });
    const absTarget = safeResolve(targetPath);
    const folder = path.dirname(absTarget);
    const targetName = path.basename(absTarget);
    if (!fs.existsSync(folder)) return json(res, 404, { error: 'pasta não existe' });
    intentionallyEditedSlides.add(absTarget);
    const snapDir = path.join(SNAPSHOT_ROOT, runId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    fs.mkdirSync(snapDir, { recursive: true });
    const siblings = fs.readdirSync(folder)
      .filter(f => /\.png$/i.test(f) && f !== targetName);
    for (const f of siblings) {
      fs.copyFileSync(path.join(folder, f), path.join(snapDir, f));
    }
    json(res, 200, { ok: true, count: siblings.length });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}

async function handleRestoreSiblings(req, res) {
  try {
    const { targetPath, runId } = JSON.parse(await readBody(req));
    if (!targetPath || !runId) return json(res, 400, { error: 'targetPath e runId obrigatórios' });
    const absTarget = safeResolve(targetPath);
    const folder = path.dirname(absTarget);
    const snapDir = path.join(SNAPSHOT_ROOT, runId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    if (!fs.existsSync(snapDir)) return json(res, 200, { ok: true, restored: 0 });
    let restored = 0;
    const restoredFiles = [];
    const skipped = [];
    for (const f of fs.readdirSync(snapDir)) {
      const snap = path.join(snapDir, f);
      const live = path.join(folder, f);
      // Se esse irmão está sendo (ou foi) editado intencionalmente em outra
      // run, não sobrescreve — a mudança no disco é legítima.
      if (intentionallyEditedSlides.has(live)) {
        skipped.push(f);
        continue;
      }
      if (!fs.existsSync(live)) {
        fs.copyFileSync(snap, live);
        restored++;
        restoredFiles.push(f);
        continue;
      }
      const snapBuf = fs.readFileSync(snap);
      const liveBuf = fs.readFileSync(live);
      if (!snapBuf.equals(liveBuf)) {
        fs.writeFileSync(live, snapBuf);
        restored++;
        restoredFiles.push(f);
      }
    }
    fs.rmSync(snapDir, { recursive: true, force: true });
    json(res, 200, { ok: true, restored, files: restoredFiles, skipped });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}

async function handleOpenFolder(req, res) {
  try {
    const { path: rel } = JSON.parse(await readBody(req));
    if (!rel) return json(res, 400, { error: 'path obrigatório' });
    const abs = safeResolve(rel);
    if (!fs.existsSync(abs)) return json(res, 404, { error: 'pasta não encontrada' });
    const stat = fs.statSync(abs);
    const target = stat.isDirectory() ? abs : path.dirname(abs);
    let cmd, args;
    if (IS_WIN) { cmd = 'explorer.exe'; args = [target]; }
    else if (process.platform === 'darwin') { cmd = 'open'; args = [target]; }
    else { cmd = 'xdg-open'; args = [target]; }
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    json(res, 200, { ok: true });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}

// ============================================================
// Roteamento — tabela única que internas e extensões populam
// Match por (método, path) exato; primeira ocorrência ganha, então
// internas (registradas primeiro) não podem ser sobrescritas por extensão.
// ============================================================
const routes = [];

function addRoute(method, p, handler) {
  if (typeof method !== 'string' || typeof p !== 'string' || typeof handler !== 'function') {
    throw new Error('addRoute(method, path, handler): tipos inválidos');
  }
  routes.push({ method: method.toUpperCase(), path: p, handler });
}

function handleRoot(req, res) {
  const file = path.join(ROOT, 'mazyui-ui.html');
  if (!fs.existsSync(file)) return text(res, 404, 'mazyui-ui.html não encontrado');
  const html = renderBrand(fs.readFileSync(file, 'utf8'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

// Servido com onerror silencioso pelo <script> da UI — 404 quando o cliente
// não tem extensão; conteúdo do arquivo quando tem.
function handleLocalUi(req, res) {
  const file = path.join(ROOT, 'local-ui.js');
  if (!fs.existsSync(file)) return text(res, 404, 'sem local-ui.js');
  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

addRoute('GET',  '/',                    handleRoot);
addRoute('GET',  '/index.html',          handleRoot);
addRoute('GET',  '/local-ui.js',         handleLocalUi);
addRoute('GET',  '/api/state',           handleState);
addRoute('POST', '/api/save',            handleSave);
addRoute('POST', '/api/delete-file',     handleDeleteFile);
addRoute('GET',  '/api/file',            (req, res, url) => handleFile(req, res, url));
addRoute('POST', '/api/run',             handleRun);
addRoute('POST', '/api/cancel',          handleCancel);
addRoute('POST', '/api/shutdown',        handleShutdown);
addRoute('POST', '/api/restart',         handleRestart);
addRoute('POST', '/api/open-folder',     handleOpenFolder);
addRoute('POST', '/api/snapshot-siblings', handleSnapshotSiblings);
addRoute('POST', '/api/restore-siblings',  handleRestoreSiblings);

// ============================================================
// Hook de extensão: carrega ./local-routes.mjs se existir
// ============================================================
async function loadLocalRoutes() {
  const localPath = path.join(ROOT, 'local-routes.mjs');
  if (!fs.existsSync(localPath)) return;
  try {
    // file:// URL pra import dinâmico funcionar bem em windows também
    const mod = await import(new URL('file://' + localPath).href);
    if (typeof mod.register !== 'function') {
      console.warn('[mazyui] local-routes.mjs existe mas não exporta register({...}). Ignorando.');
      return;
    }
    mod.register({
      ROOT,
      helpers: { json, text, readBody, safeResolve, readSafe },
      addRoute,
    });
    console.log('[mazyui] local-routes.mjs carregado.');
  } catch (e) {
    console.error('[mazyui] Erro carregando local-routes.mjs — extensão ignorada:', e.message);
  }
}

// ============================================================
// Server
// ============================================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const method = req.method;

  try {
    for (const r of routes) {
      if (r.method === method && r.path === p) {
        return r.handler(req, res, url);
      }
    }
    text(res, 404, 'Não encontrado');
  } catch (e) {
    text(res, 500, 'Erro: ' + (e.message || e));
  }
});

await loadLocalRoutes();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ${brand.consoleLabel}`);
  console.log(`  → http://localhost:${PORT}\n`);
});

process.on('SIGINT', () => {
  for (const proc of activeRuns.values()) {
    try { proc.kill(); } catch {}
  }
  process.exit(0);
});
