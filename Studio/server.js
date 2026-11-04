const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const otaManager = require('./ota_manager');

// Keep-alive guards against crashes
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = 3395;
const FRAMES_DIR = path.join(__dirname, 'render_frames');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');
const FONTS_DIR = path.join(__dirname, 'fonts');
const PRESETS_FILE = path.join(__dirname, 'saved_presets.json');

// Auto-resolve parent library folder portably across any Drive letter or PC
function getLibraryDir() {
  const parentDir = path.resolve(__dirname, '..');
  if (path.basename(parentDir).toUpperCase().includes('CHERRY MOTIONS')) {
    return parentDir;
  }
  const defaultDrive = "G:\\Meu Drive\\00. MARKETING GTK\\PROJETOS EDIÇÃO\\00. APENAS EDITOR\\CHERRY MOTIONS";
  if (fs.existsSync(defaultDrive)) return defaultDrive;
  return OUTPUTS_DIR;
}

// Auto-detect bundled portable FFmpeg or system FFmpeg
function getFfmpegBin(unquoted = false) {
  const bundled = path.join(__dirname, 'bin', 'ffmpeg.exe');
  if (fs.existsSync(bundled)) return unquoted ? bundled : `"${bundled}"`;
  const uniprae = path.join(process.env.LOCALAPPDATA || '', 'Uniprae', 'bin', 'ffmpeg.exe');
  if (fs.existsSync(uniprae)) return unquoted ? uniprae : `"${uniprae}"`;
  return 'ffmpeg';
}

// Auto-detect Chromium browser (Chrome or Edge) on any Windows computer
function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

[FRAMES_DIR, OUTPUTS_DIR, FONTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const MOGRTS_DIR = path.join(__dirname, 'mogrts');
const CHERRY_MOGRTS_DIR = path.join(MOGRTS_DIR, 'Cherry Motions');
const MOGRT_MANIFEST_PATH = path.join(CHERRY_MOGRTS_DIR, 'manifest.json');
const JSX_HOST_PATH = path.join(__dirname, 'host', 'index.jsx');

function getMogrtCatalog() {
  let manifest = {};
  if (fs.existsSync(MOGRT_MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MOGRT_MANIFEST_PATH, 'utf8'));
    } catch (e) {
      manifest = {};
    }
  } else {
    try {
      const { buildAllMogrts } = require('./build_cherry_mogrts.js');
      manifest = buildAllMogrts();
    } catch(e) {
      console.warn('[MOGRT Engine] Auto-build manifest error:', e.message);
    }
  }

  const extraTemplates = [];
  if (fs.existsSync(MOGRTS_DIR)) {
    try {
      const files = fs.readdirSync(MOGRTS_DIR);
      files.forEach(f => {
        if (f.toLowerCase().endsWith('.mogrt')) {
          extraTemplates.push({
            fileName: f,
            name: path.basename(f, '.mogrt'),
            fullPath: path.join(MOGRTS_DIR, f),
            isExtra: true
          });
        }
      });
    } catch(e){}
  }

  return { manifest, extraTemplates };
}

function resolveMogrtPath(query) {
  if (!query) return null;
  if (query.mogrtPath && fs.existsSync(query.mogrtPath)) {
    return query.mogrtPath;
  }
  const { manifest, extraTemplates } = getMogrtCatalog();
  if (query.cat && query.sub) {
    const k = `${query.cat}/${query.sub}`;
    if (manifest[k] && manifest[k].fullPath && fs.existsSync(manifest[k].fullPath)) {
      return manifest[k].fullPath;
    }
  }
  if (query.fileName) {
    const cand1 = path.join(CHERRY_MOGRTS_DIR, query.fileName);
    if (fs.existsSync(cand1)) return cand1;
    const cand2 = path.join(MOGRTS_DIR, query.fileName);
    if (fs.existsSync(cand2)) return cand2;
  }
  if (query.name) {
    for (const k in manifest) {
      if (manifest[k].name === query.name && fs.existsSync(manifest[k].fullPath)) {
        return manifest[k].fullPath;
      }
    }
    const extra = extraTemplates.find(x => x.name.toLowerCase() === query.name.toLowerCase());
    if (extra && fs.existsSync(extra.fullPath)) return extra.fullPath;
  }
  // Fallback: look for any .mogrt in CHERRY_MOGRTS_DIR
  if (fs.existsSync(CHERRY_MOGRTS_DIR)) {
    const list = fs.readdirSync(CHERRY_MOGRTS_DIR).filter(f => f.toLowerCase().endsWith('.mogrt'));
    if (list.length > 0) return path.join(CHERRY_MOGRTS_DIR, list[0]);
  }
  return null;
}

let currentRender = null;
let clientReloadRequested = false;

// Convert file paths into safe ExtendScript-compatible strings with Unicode escape for non-ASCII
function toExtendScriptPath(filePath) {
  if (!filePath) return "";
  return filePath.replace(/\\/g, "/").split("").map(c => {
    const code = c.charCodeAt(0);
    return code > 127 ? "\\u" + ("0000" + code.toString(16)).slice(-4) : c;
  }).join("");
}

// Convert arbitrary values/strings into safe ExtendScript Unicode literals
function toExtendScriptLiteral(val) {
  if (val === null || val === undefined) return '""';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  const s = String(val);
  const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").split("").map(c => {
    const code = c.charCodeAt(0);
    return code > 127 ? "\\u" + ("0000" + code.toString(16)).slice(-4) : c;
  }).join("");
  return `"${escaped}"`;
}

// Helper to communicate with Premiere Pro MCP bridge on port 3005 (with 25s timeout)
function callPremiereScript(code) {
  return new Promise((resolve) => {
    try {
      const postData = JSON.stringify({ code: code, script: code });
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3005,
        path: '/eval',
        method: 'POST',
        timeout: 25000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { resolve({ success: false, raw: data }); }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        console.warn('[Premiere Bridge] Timeout conectando à porta 3005 (Premiere ocupado ou bridge fechado)');
        resolve({ success: false, offline: true, error: 'Premiere bridge timeout' });
      });
      req.on('error', err => {
        console.warn(`[Premiere Bridge] Porta 3005 offline (${err.message})`);
        resolve({ success: false, offline: true, error: err.message });
      });
      req.write(postData);
      req.end();
    } catch (e) {
      console.warn(`[Premiere Bridge] Erro ao chamar script: ${e.message}`);
      resolve({ success: false, offline: true, error: e.message });
    }
  });
}

// Unpack and normalize responses from ExtendScript / MCP Bridge
function extractPremiereResult(res) {
  if (!res) return null;
  if (res.result !== undefined) {
    if (typeof res.result === 'string') {
      try {
        const parsed = JSON.parse(res.result);
        if (typeof parsed === 'string') {
          try { return JSON.parse(parsed); } catch(e){ return parsed; }
        }
        return parsed;
      } catch (e) {
        return res.result;
      }
    }
    return res.result;
  }
  if (typeof res === 'string') {
    try { return JSON.parse(res); } catch (e) { return res; }
  }
  return res;
}

// Lookup animation metadata (.cherry.json sidecar or registry)
function getClipMetadata(mediaPath) {
  if (!mediaPath) return null;
  const readCleanJson = (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      return JSON.parse(raw);
    } catch(e) {
      return null;
    }
  };

  try {
    // 1. Direct sidecar file next to media
    const sidecarPath = mediaPath.replace(/\.mov$/i, '.cherry.json');
    if (fs.existsSync(sidecarPath)) {
      const parsed = readCleanJson(sidecarPath);
      if (parsed) return parsed;
    }
    // 2. Candidate inside OUTPUTS_DIR
    const baseJson = path.basename(mediaPath).replace(/\.mov$/i, '.cherry.json');
    const outputsPath = path.join(OUTPUTS_DIR, baseJson);
    if (fs.existsSync(outputsPath)) {
      const parsed = readCleanJson(outputsPath);
      if (parsed) return parsed;
    }
    // 3. Central library candidate
    const libDir = getLibraryDir();
    if (libDir && fs.existsSync(libDir)) {
      const libPath = path.join(libDir, baseJson);
      if (fs.existsSync(libPath)) {
        const parsed = readCleanJson(libPath);
        if (parsed) return parsed;
      }
    }
    // 4. Registry map
    const regPath = path.join(OUTPUTS_DIR, 'clips_registry.json');
    if (fs.existsSync(regPath)) {
      const reg = readCleanJson(regPath);
      if (reg) {
        if (reg[mediaPath]) return reg[mediaPath];
        const base = path.basename(mediaPath);
        if (reg[base]) return reg[base];
      }
    }
  } catch (e) {
    console.error('[Metadata] Error reading clip metadata:', e.message);
  }
  return null;
}

async function deliverRenderedClip(config, outputPath, fileName) {
  const isUpdate = Boolean(config.updateMode || config.action === 'update' || config.mode === 'update');
  const targetClipMediaPath = config.targetClipMediaPath || null;
  const actualMode = (config.mode === 'update' && config.cat) ? config.cat : ((config.cat && config.cat !== 'update') ? config.cat : (config.mode !== 'update' ? config.mode : 'viral'));
  const actualSub = config.subType || config.sub || 'kinetic_slam';

  // Copy to Central Library if enabled and different from OUTPUTS_DIR
  const libDir = getLibraryDir();
  let savedLibraryPath = null;
  if (config.saveToLibrary && libDir && libDir !== OUTPUTS_DIR && fs.existsSync(libDir)) {
    const libPath = path.join(libDir, fileName);
    try {
      fs.copyFileSync(outputPath, libPath);
      savedLibraryPath = libPath;
    } catch (e) {}
  }

  // Save Sidecar Metadata (.cherry.json) & update registry
  const metadata = {
    version: "2.0-turbo",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fileName,
    outputPath,
    cat: actualMode,
    sub: actualSub,
    mode: actualMode,
    subType: actualSub,
    layers: config.layers || {},
    posX: config.posX !== undefined ? config.posX : 0.5,
    posY: config.posY !== undefined ? config.posY : 0.5,
    globalScale: config.globalScale || 1.0,
    globalSpeed: config.globalSpeed || 1.0,
    globalDelay: config.globalDelay || 0,
    duration: config.duration || 3.0,
    fps: config.fps || 29.97,
    isUpdate,
    targetClipMediaPath
  };

  const metaPath = outputPath.replace(/\.mov$/i, '.cherry.json');
  try {
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
    if (savedLibraryPath) {
      fs.writeFileSync(savedLibraryPath.replace(/\.mov$/i, '.cherry.json'), JSON.stringify(metadata, null, 2), 'utf8');
    }
    const regPath = path.join(OUTPUTS_DIR, 'clips_registry.json');
    let registry = {};
    if (fs.existsSync(regPath)) {
      try { registry = JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch(e){}
    }
    registry[outputPath] = metadata;
    registry[fileName] = metadata;
    if (savedLibraryPath) registry[savedLibraryPath] = metadata;
    if (targetClipMediaPath) registry[targetClipMediaPath] = metadata;
    fs.writeFileSync(regPath, JSON.stringify(registry, null, 2), 'utf8');
  } catch (e) {
    console.error('[Metadata] Error persisting .cherry.json:', e.message);
  }

  // Inject or Hot-Swap to Premiere Pro
  let premiereResult = null;
  if (config.injectPremiere !== false) {
    try {
      const escapedNewPath = toExtendScriptPath(outputPath);

      if (isUpdate && targetClipMediaPath) {
        // HOT-SWAP IN-PLACE MODE (changeMediaPath preserves position, scale, in/out, keyframes)
        const escapedTargetPath = toExtendScriptPath(targetClipMediaPath);
        const updateScript = `(function() {
          try {
            var seq = app.project ? app.project.activeSequence : null;
            var target = "${escapedTargetPath}";
            var newFile = "${escapedNewPath}";

            function getBaseName(p) {
              if (!p) return "";
              var parts = (p || "").replace(/\\\\/g, "/").split("/");
              return parts[parts.length - 1].toLowerCase();
            }
            var targetBase = getBaseName(target);

            function findItem(item) {
              if (!item) return null;
              if (item.name && item.name.toLowerCase() === targetBase) return item;
              if (item.type === ProjectItemType.CLIP || item.type === ProjectItemType.FILE) {
                try {
                  if (item.getMediaPath && getBaseName(item.getMediaPath()) === targetBase) return item;
                } catch(e){}
              }
              if (item.children) {
                for (var i = 0; i < item.children.numItems; i++) {
                  var res = findItem(item.children[i]);
                  if (res) return res;
                }
              }
              return null;
            }

            var prItem = findItem(app.project.rootItem);
            if (!prItem && seq) {
              var sel = seq.getSelection();
              if (sel && sel.length > 0 && sel[0].projectItem) {
                prItem = sel[0].projectItem;
              }
            }

            if (!prItem) return JSON.stringify({ success: false, error: "Clip nao encontrado no projeto: " + target });

            var fNew = new File(newFile);
            var ok = prItem.changeMediaPath(fNew.exists ? fNew.fsName : newFile, true);
            app.project.save();
            return JSON.stringify({
              success: true,
              updated: true,
              itemName: prItem.name,
              oldPath: target,
              newPath: newFile,
              changed: ok
            });
          } catch(err) {
            return JSON.stringify({ success: false, error: err.toString() });
          }
        })()`;

        const prRes = await callPremiereScript(updateScript);
        premiereResult = extractPremiereResult(prRes);
      } else {
        // INSERT AT PLAYHEAD / TRACK MODE
        const targetTrackIndex = (config.targetTrack !== undefined) ? config.targetTrack : 1;
        const placeScript = `(function() {
          var seq = app.project ? app.project.activeSequence : null;
          if (!seq) return JSON.stringify({ error: "Nenhuma sequencia ativa no Premiere" });

          var f = new File("${escapedNewPath}");
          if (!f.exists) return JSON.stringify({ error: "Arquivo ProRes gerado nao encontrado: " + "${escapedNewPath}" });

          app.project.importFiles([f.fsName], false, app.project.rootItem, false);

          var importedItem = null;
          for (var i = 0; i < app.project.rootItem.children.numItems; i++) {
            var it = app.project.rootItem.children[i];
            if (it.name === "${fileName}") {
              importedItem = it;
              break;
            }
          }
          if (!importedItem) return JSON.stringify({ error: "Item importado nao encontrado" });

          var targetTrackIndex = ${targetTrackIndex};
          if (targetTrackIndex >= seq.videoTracks.numTracks) {
            targetTrackIndex = seq.videoTracks.numTracks - 1;
          }

          var insertTime = new Time();
          insertTime.seconds = ${config.insertAtPlayhead !== false ? 'seq.getPlayerPosition().seconds' : (config.insertTime || 0)};

          seq.overwriteClip(importedItem, insertTime, targetTrackIndex, 0);

          var previewTime = new Time();
          previewTime.seconds = insertTime.seconds + 0.8;
          seq.setPlayerPosition(previewTime.ticks);

          app.project.save();
          return JSON.stringify({
            success: true,
            placedAt: insertTime.seconds,
            track: targetTrackIndex,
            file: "${fileName}"
          });
        })()`;

        const prRes = await callPremiereScript(placeScript);
        premiereResult = extractPremiereResult(prRes);
      }
    } catch (e) {
      premiereResult = { success: false, offline: true, error: e.message };
    }
  }

  const stat = fs.statSync(outputPath);
  return {
    success: true,
    fileName,
    outputPath,
    savedLibraryPath,
    metadata,
    sizeMB: (stat.size / (1024 * 1024)).toFixed(2),
    downloadUrl: `/outputs/${encodeURIComponent(fileName)}`,
    premiere: premiereResult
  };
}

async function encodeAndDeliver(config) {
  const sanitize = (str) => (str || 'Motion').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const isUpdate = Boolean(config.updateMode || config.action === 'update' || config.mode === 'update');
  const actualMode = (config.mode === 'update' && config.cat) ? config.cat : ((config.cat && config.cat !== 'update') ? config.cat : (config.mode !== 'update' ? config.mode : 'viral'));
  const actualSub = config.subType || config.sub || 'kinetic_slam';

  const fileName = `CherryMotion_${actualMode}_${sanitize(actualSub)}_${Date.now()}${isUpdate ? '_rev' : ''}.mov`;
  const outputPath = path.join(OUTPUTS_DIR, fileName);
  const ffmpegBin = getFfmpegBin();

  const ffmpegCmd = `${ffmpegBin} -y -framerate ${config.fps} -i "${path.join(FRAMES_DIR, 'frame_%04d.png')}" -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le "${outputPath}"`;
  console.log('[Portable Engine] Encoding ProRes 4444 with:', ffmpegBin);

  await new Promise((resolve, reject) => {
    exec(ffmpegCmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`FFmpeg error: ${stderr}`));
      resolve();
    });
  });

  console.log('[Portable Engine] Exported:', outputPath);
  return await deliverRenderedClip(config, outputPath, fileName);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-cherry-config, *');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Static Index HTML
  if (req.method === 'GET' && pathname === '/') {
    const htmlPath = path.join(__dirname, 'index.html');
    fs.readFile(htmlPath, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end("Error loading index.html");
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(content);
      }
    });
    return;
  }

  // Shared drawing engine (preview + headless renderer)
  if (req.method === 'GET' && pathname === '/engine.js') {
    fs.readFile(path.join(__dirname, 'engine.js'), 'utf8', (err, content) => {
      if (err) { res.writeHead(500); res.end('Error loading engine.js'); return; }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(content);
    });
    return;
  }

  // Serve bundled portable fonts (/fonts/*)
  if (req.method === 'GET' && pathname.startsWith('/fonts/')) {
    const fontName = path.basename(pathname);
    const fontPath = path.join(FONTS_DIR, fontName);
    if (!fs.existsSync(fontPath)) {
      res.writeHead(404);
      res.end('Font not found');
      return;
    }
    const ext = path.extname(fontName).toLowerCase();
    const mime = ext === '.otf' ? 'font/otf' : ext === '.ttf' ? 'font/ttf' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(fontPath).pipe(res);
    return;
  }

  // Serve rendered .MOV files for direct download (/outputs/*)
  if (req.method === 'GET' && pathname.startsWith('/outputs/')) {
    const fileName = path.basename(pathname);
    const filePath = path.join(OUTPUTS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Output file not found');
      return;
    }
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'video/quicktime',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${fileName}"`
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // List recent rendered outputs
  if (req.method === 'GET' && pathname === '/api/outputs') {
    try {
      const files = fs.readdirSync(OUTPUTS_DIR)
        .filter(f => f.toLowerCase().endsWith('.mov'))
        .map(f => {
          const p = path.join(OUTPUTS_DIR, f);
          const st = fs.statSync(p);
          return {
            fileName: f,
            outputPath: p,
            sizeMB: (st.size / (1024 * 1024)).toFixed(2),
            mtime: st.mtimeMs,
            downloadUrl: `/outputs/${encodeURIComponent(f)}`
          };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 15);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, outputsDir: OUTPUTS_DIR, libraryDir: getLibraryDir(), files }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Open file or folder in Windows Explorer
  if (req.method === 'POST' && pathname === '/api/open-folder') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const showExe = path.join(__dirname, 'bin', 'ShowInFolder.exe');
        let targetDir = OUTPUTS_DIR;
        if (data.folder === 'library') targetDir = getLibraryDir();
        else if (data.folder === 'dist') targetDir = otaManager.getStudioPaths().distDir;
        else if (data.folder && fs.existsSync(data.folder)) targetDir = data.folder;

        let targetFile = null;
        if (data.filePath && fs.existsSync(data.filePath)) {
          targetFile = data.filePath;
          targetDir = path.dirname(targetFile);
        } else if (data.fileName) {
          const cand1 = (data.folder && fs.existsSync(path.join(data.folder, path.basename(data.fileName)))) ? path.join(data.folder, path.basename(data.fileName)) : null;
          const cand2 = path.join(OUTPUTS_DIR, path.basename(data.fileName));
          if (cand1 && fs.existsSync(cand1)) targetFile = cand1;
          else if (fs.existsSync(cand2)) targetFile = cand2;
          if (targetFile) targetDir = path.dirname(targetFile);
        } else {
          // If no specific file requested, select newest .mov file in OUTPUTS_DIR
          try {
            const movs = fs.readdirSync(targetDir)
              .filter(f => f.toLowerCase().endsWith('.mov'))
              .map(f => ({ name: f, mtime: fs.statSync(path.join(targetDir, f)).mtimeMs }))
              .sort((a, b) => b.mtime - a.mtime);
            if (movs.length > 0) targetFile = path.join(targetDir, movs[0].name);
          } catch (e) {}
        }

        if (fs.existsSync(showExe)) {
          const args = targetFile ? ['--select', targetFile] : ['--folder', targetDir];
          const child = spawn(showExe, args, { detached: true, stdio: 'ignore', windowsHide: true });
          child.unref();
        } else if (targetFile) {
          exec(`powershell -NoProfile -Command "Start-Process explorer.exe -ArgumentList '/select,\\"${targetFile}\\"' -WindowStyle Normal"`, { windowsHide: true });
        } else {
          exec(`powershell -NoProfile -Command "Start-Process explorer.exe -ArgumentList '\\"${targetDir}\\"' -WindowStyle Normal"`, { windowsHide: true });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          openedPath: targetFile || targetDir
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Portable Presets Sync
  if (req.method === 'GET' && pathname === '/api/presets') {
    let presets = {};
    if (fs.existsSync(PRESETS_FILE)) {
      try { presets = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8')); } catch (e) {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(presets));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/presets') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        fs.writeFileSync(PRESETS_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Premiere Status & Active Sequence Specs
  if (req.method === 'GET' && pathname === '/api/premiere-status') {
    try {
      const script = `(function() {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return JSON.stringify({ hasSeq: false });
        var settings = null;
        try { settings = seq.getSettings(); } catch(e){}
        var fps = 30;
        var width = 1920;
        var height = 1080;
        if (settings) {
          try { fps = 1 / settings.videoFrameRate.seconds; } catch(e){}
          try { width = settings.videoFrameWidth; } catch(e){}
          try { height = settings.videoFrameHeight; } catch(e){}
        }
        var playhead = 0;
        try { playhead = seq.getPlayerPosition().seconds; } catch(e){}
        var prPath = "";
        try { prPath = app.project.path || ""; } catch(e){}
        var prName = "Premiere Pro";
        try { prName = app.project.name || "Premiere Pro"; } catch(e){}
        return JSON.stringify({
          hasSeq: true,
          seqName: seq.name,
          seqId: seq.sequenceID,
          fps: Math.round(fps * 100) / 100,
          playhead: Math.round(playhead * 100) / 100,
          width: width,
          height: height,
          prPath: prPath,
          prName: prName,
          videoTracks: seq.videoTracks ? seq.videoTracks.numTracks : 0
        });
      })()`;
      const result = await callPremiereScript(script);
      const extracted = extractPremiereResult(result);
      let parsed = (extracted && typeof extracted === 'object' && extracted.hasSeq !== undefined) ? extracted : { hasSeq: false };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(parsed));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hasSeq: false, offline: true, error: err.message }));
    }
    return;
  }

  // Selected Clip Detection & Live-Link Sync (ProRes 4444)
  if (req.method === 'GET' && pathname === '/api/selected-clip') {
    try {
      const script = `(function() {
        try {
          var seq = app.project ? app.project.activeSequence : null;
          if (!seq) return JSON.stringify({ hasSeq: false });
          var sel = seq.getSelection();
          var clip = null;

          if (sel && sel.length > 0) {
            for (var s = 0; s < sel.length; s++) {
              var cand = sel[s];
              if (cand && cand.name && cand.name.toLowerCase().indexOf("cherrymotion") !== -1) {
                clip = cand;
                break;
              }
              if (!clip && cand && cand.mediaType === "Video") {
                clip = cand;
              }
            }
            if (!clip) clip = sel[0];
          }

          if (!clip) {
            for (var t = 0; t < seq.videoTracks.numTracks; t++) {
              var tr = seq.videoTracks[t];
              for (var c = 0; c < tr.clips.numItems; c++) {
                if (tr.clips[c] && tr.clips[c].isSelected && tr.clips[c].isSelected()) {
                  clip = tr.clips[c];
                  break;
                }
              }
              if (clip) break;
            }
          }

          if (!clip) return JSON.stringify({ hasSeq: true, hasSelection: false });

          var prItem = null;
          try { prItem = clip.projectItem; } catch(e){}
          var mediaPath = "";
          try { if (prItem && prItem.getMediaPath) mediaPath = prItem.getMediaPath(); } catch(e){}
          var inSec = 0, outSec = 0, durSec = 0, startSec = 0, endSec = 0;
          try { inSec = clip.inPoint ? clip.inPoint.seconds : 0; } catch(e){}
          try { outSec = clip.outPoint ? clip.outPoint.seconds : 0; } catch(e){}
          try { durSec = clip.duration ? clip.duration.seconds : 0; } catch(e){}
          try { startSec = clip.start ? clip.start.seconds : 0; } catch(e){}
          try { endSec = clip.end ? clip.end.seconds : 0; } catch(e){}
          return JSON.stringify({
            hasSeq: true,
            hasSelection: true,
            clipName: clip.name || (prItem ? prItem.name : "Clip"),
            mediaPath: mediaPath,
            nodeId: clip.nodeId || "",
            inPoint: inSec,
            outPoint: outSec,
            duration: durSec,
            start: startSec,
            end: endSec
          });
        } catch(err) {
          return JSON.stringify({ hasSeq: false, error: err.toString() });
        }
      })()`;
      const result = await callPremiereScript(script);
      const extracted = extractPremiereResult(result);
      let parsed = (extracted && typeof extracted === 'object' && extracted.hasSeq !== undefined) ? extracted : { hasSeq: false };
      if (parsed.hasSelection) {
        if (parsed.mediaPath) {
          const meta = getClipMetadata(parsed.mediaPath);
          if (meta) {
            parsed.isCherry = true;
            parsed.metadata = meta;
          } else {
            const base = path.basename(parsed.mediaPath);
            parsed.isCherry = base.toLowerCase().startsWith('cherrymotion');
          }
        } else if (parsed.clipName) {
          parsed.isCherry = parsed.clipName.toLowerCase().startsWith('cherrymotion');
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(parsed));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hasSeq: false, offline: true, error: err.message }));
    }
    return;
  }

  // Clip Metadata lookup
  if (req.method === 'GET' && pathname === '/api/clip-metadata') {
    const targetPath = parsedUrl.searchParams.get('path') || '';
    const meta = getClipMetadata(targetPath);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ found: Boolean(meta), metadata: meta }));
    return;
  }

  // Reload clients trigger
  if ((req.method === 'POST' || req.method === 'GET') && pathname === '/api/reload-clients') {
    clientReloadRequested = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/check-reload') {
    const shouldReload = clientReloadRequested;
    clientReloadRequested = false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reload: shouldReload }));
    return;
  }

  // --- Over-The-Air (OTA) Auto-Update APIs ---
  if (req.method === 'GET' && pathname === '/api/ota/status') {
    const status = {
      ...otaManager.getVersionInfo(),
      activeDir: __dirname,
      paths: otaManager.getStudioPaths()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/ota/check') {
    const customUrl = parsedUrl.searchParams.get('url');
    try {
      const result = await otaManager.checkForUpdates(customUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, updateAvailable: false }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/ota/apply') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = await otaManager.applyUpdate(payload.bundle || payload.sourcePath || null);

        // Dispara reload em todos os clientes conectados (navegador e Premiere CEP)
        clientReloadRequested = true;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

        // Auto-reinicia o servidor em background para carregar novos arquivos
        console.log('[OTA Server] Reiniciando processo Node em 800ms...');
        setTimeout(() => {
          try {
            const nodeBin = process.argv[0];
            const script = process.argv[1];
            const child = spawn(nodeBin, [script], {
              cwd: __dirname,
              detached: true,
              stdio: 'ignore',
              windowsHide: true
            });
            child.unref();
            process.exit(0);
          } catch(e) {
            console.error('[OTA Server] Falha ao auto-reiniciar:', e);
          }
        }, 800);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/ota/publish') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const builder = require('./build_zxp_and_ota');
        const prevArgv = process.argv;
        process.argv = ['node', 'build_zxp_and_ota.js'];
        if (payload.bump) process.argv.push('--bump', payload.bump);
        if (payload.version) process.argv.push('--version', payload.version);
        const resBuild = await builder.main();
        process.argv = prevArgv;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resBuild));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/ota/config') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const cfg = JSON.parse(body || '{}');
        const current = otaManager.getVersionInfo();
        if (cfg.remoteManifestUrl !== undefined) current.remoteManifestUrl = cfg.remoteManifestUrl;
        if (cfg.channel !== undefined) current.channel = cfg.channel;
        otaManager.saveVersionInfo(current);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, config: current }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Premiere Eval Proxy
  if (req.method === 'POST' && pathname === '/api/premiere-eval') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const script = payload.script || payload.code;
        if (!script) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing script' }));
          return;
        }
        const result = await callPremiereScript(script);
        const extracted = extractPremiereResult(result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(extracted));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // CHERRY MOTION STUDIO 2.0: MOGRT NATIVE ENGINE ROUTES
  // ==========================================

  // MOGRT Native Engine: Catalog listing (all 29 templates + extra)
  if (req.method === 'GET' && pathname === '/api/mogrts/catalog') {
    try {
      const { manifest, extraTemplates } = getMogrtCatalog();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: Object.keys(manifest).length,
        catalog: manifest,
        extraTemplates: extraTemplates
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // MOGRT Native Engine: Rebuild all 29 MOGRT templates
  if (req.method === 'POST' && pathname === '/api/mogrts/rebuild') {
    try {
      console.log('[MOGRT Engine] Rebuilding all 29 MOGRT templates...');
      const { buildAllMogrts } = require('./build_cherry_mogrts.js');
      const manifest = buildAllMogrts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: Object.keys(manifest).length,
        catalog: manifest
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // MOGRT Native Engine: Insert MOGRT at playhead with zero render wait (0ms)
  if (req.method === 'POST' && pathname === '/api/mogrts/insert') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const resolvedPath = resolveMogrtPath(payload);
        if (!resolvedPath || !fs.existsSync(resolvedPath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'MOGRT template file not found on disk: ' + (payload.mogrtPath || payload.fileName || payload.sub) }));
          return;
        }

        const mogrtPayload = {
          mogrtPath: resolvedPath,
          videoTrackOffset: payload.videoTrackOffset !== undefined ? payload.videoTrackOffset : 1,
          audioTrackOffset: payload.audioTrackOffset !== undefined ? payload.audioTrackOffset : 0,
          durationSec: payload.durationSec || 3.0,
          clipName: payload.clipName || path.basename(resolvedPath, '.mogrt'),
          params: payload.params || {}
        };

        const escapedPayload = JSON.stringify(mogrtPayload).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const escapedHostPath = toExtendScriptPath(JSX_HOST_PATH);

        const script = `(function() {
          try {
            try { $.evalFile(new File("${escapedHostPath}")); } catch(e){}
            if (typeof CherryExtendScript !== 'undefined' && CherryExtendScript.insertMogrtAtPlayhead) {
              return CherryExtendScript.insertMogrtAtPlayhead("${escapedPayload}");
            }
            return JSON.stringify({ success: false, error: "CherryExtendScript nao carregado no Premiere Pro." });
          } catch(err) {
            return JSON.stringify({ success: false, error: err.toString() });
          }
        })()`;

        const prRes = await callPremiereScript(script);
        const result = extractPremiereResult(prRes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result || prRes));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // MOGRT Native Engine: Update Selected MOGRT parameters in real-time
  if (req.method === 'POST' && pathname === '/api/mogrts/update') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const escapedPayload = JSON.stringify(payload).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const escapedHostPath = toExtendScriptPath(JSX_HOST_PATH);

        const script = `(function() {
          try {
            try { $.evalFile(new File("${escapedHostPath}")); } catch(e){}
            if (typeof CherryExtendScript !== 'undefined' && CherryExtendScript.updateSelectedMogrtParams) {
              return CherryExtendScript.updateSelectedMogrtParams("${escapedPayload}");
            }
            return JSON.stringify({ success: false, error: "CherryExtendScript nao carregado no Premiere Pro." });
          } catch(err) {
            return JSON.stringify({ success: false, error: err.toString() });
          }
        })()`;

        const prRes = await callPremiereScript(script);
        const result = extractPremiereResult(prRes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result || prRes));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // MOGRT Native Engine: Batch insert captions sequence
  if (req.method === 'POST' && pathname === '/api/mogrts/sequence') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const resolvedPath = resolveMogrtPath(payload);
        if (!resolvedPath || !fs.existsSync(resolvedPath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'MOGRT template file not found on disk: ' + (payload.mogrtPath || payload.fileName || payload.sub) }));
          return;
        }

        const seqPayload = {
          mogrtPath: resolvedPath,
          phrases: payload.phrases || [],
          durationPerPhrase: payload.durationPerPhrase || 2.0,
          videoTrackOffset: payload.videoTrackOffset !== undefined ? payload.videoTrackOffset : 1,
          startSeconds: payload.startSeconds
        };

        const escapedPayload = JSON.stringify(seqPayload).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const escapedHostPath = toExtendScriptPath(JSX_HOST_PATH);

        const script = `(function() {
          try {
            try { $.evalFile(new File("${escapedHostPath}")); } catch(e){}
            if (typeof CherryExtendScript !== 'undefined' && CherryExtendScript.insertMogrtSequence) {
              return CherryExtendScript.insertMogrtSequence("${escapedPayload}");
            }
            return JSON.stringify({ success: false, error: "CherryExtendScript nao carregado no Premiere Pro." });
          } catch(err) {
            return JSON.stringify({ success: false, error: err.toString() });
          }
        })()`;

        const prRes = await callPremiereScript(script);
        const result = extractPremiereResult(prRes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result || prRes));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // MOGRT Native Engine: Inspect selected or playhead MOGRT clip
  if (req.method === 'GET' && pathname === '/api/mogrts/selected') {
    try {
      const escapedHostPath = toExtendScriptPath(JSX_HOST_PATH);
      const script = `(function() {
        try {
          try { $.evalFile(new File("${escapedHostPath}")); } catch(e){}
          if (typeof CherryExtendScript !== 'undefined' && CherryExtendScript.getSelectedMogrtInfo) {
            return CherryExtendScript.getSelectedMogrtInfo();
          }
          return JSON.stringify({ hasSeq: false, error: "CherryExtendScript nao carregado no Premiere Pro." });
        } catch(err) {
          return JSON.stringify({ hasSeq: false, error: err.toString() });
        }
      })()`;
      const prRes = await callPremiereScript(script);
      const result = extractPremiereResult(prRes);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result || prRes));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hasSeq: false, error: e.message }));
    }
    return;
  }

  // Prepare clean frames directory (for client-side frame capture mode)
  if (req.method === 'POST' && pathname === '/render/init') {
    fs.readdirSync(FRAMES_DIR).forEach(f => {
      try { fs.unlinkSync(path.join(FRAMES_DIR, f)); } catch (e) {}
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Render Frame Receiver
  if (req.method === 'POST' && pathname === '/render/frame') {
    const idx = parsedUrl.searchParams.get('i') || '0';
    const filename = `frame_${idx.padStart(4, '0')}.png`;
    const filepath = path.join(FRAMES_DIR, filename);
    const fileStream = fs.createWriteStream(filepath);
    req.pipe(fileStream);
    fileStream.on('finish', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, frame: idx }));
    });
    return;
  }

  // Encode frames already uploaded by the client browser
  if (req.method === 'POST' && pathname === '/api/encode-frames') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const config = JSON.parse(body || '{}');
        const result = await encodeAndDeliver(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('Encode error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Turbo Direct-Pipe Engine: Stream concatenated PNG frames directly into FFmpeg stdin via image2pipe
  if (req.method === 'POST' && pathname === '/api/turbo-render') {
    let config = {};
    const configHeader = req.headers['x-cherry-config'] || parsedUrl.searchParams.get('config') || '';
    if (configHeader) {
      try {
        config = JSON.parse(decodeURIComponent(configHeader));
      } catch (e) {
        try { config = JSON.parse(configHeader); } catch (e2) {}
      }
    }

    const tStart = Date.now();
    const fps = parseFloat(config.fps) || 29.97;
    const isUpdate = Boolean(config.updateMode || config.action === 'update' || config.mode === 'update');
    const actualCat = (config.mode === 'update' && config.cat) ? config.cat : ((config.cat && config.cat !== 'update') ? config.cat : (config.mode !== 'update' ? config.mode : 'haute'));
    const actualSub = config.subType || config.sub || '05c';
    const sanitize = (str) => (str || 'Motion').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const fileName = `CherryMotion_${actualCat}_${sanitize(actualSub)}_${Date.now()}${isUpdate ? '_rev' : ''}.mov`;
    const outputPath = path.join(OUTPUTS_DIR, fileName);

    const tempOut = path.join(os.tmpdir(), `cherry_turbo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mov`);
    const ffmpegBin = getFfmpegBin(true);

    console.log(`[Turbo Direct-Pipe] Ingesting binary PNG frame stream for ${actualCat}/${actualSub} @ ${fps}fps...`);

    const ff = spawn(ffmpegBin, [
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-r', String(fps),
      '-i', 'pipe:0',
      '-c:v', 'prores_ks',
      '-profile:v', '4',
      '-pix_fmt', 'yuva444p10le',
      '-y',
      tempOut
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    let ffError = '';
    ff.stderr.on('data', chunk => {
      ffError += chunk.toString();
    });

    req.pipe(ff.stdin);

    try {
      await new Promise((resolve, reject) => {
        ff.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exited with code ${code}: ${ffError.slice(-400)}`));
        });
        ff.on('error', err => reject(err));
        req.on('error', err => reject(err));
      });

      const encodeMs = Date.now() - tStart;
      console.log(`[Turbo Direct-Pipe] Encoded ProRes 4444 in ${encodeMs}ms to SSD temp!`);

      fs.copyFileSync(tempOut, outputPath);
      try { fs.unlinkSync(tempOut); } catch (e) {}

      config.fps = fps;
      config.mode = actualCat;
      config.subType = actualSub;
      config.sub = actualSub;
      config.cat = actualCat;

      const delivery = await deliverRenderedClip(config, outputPath, fileName);
      delivery.durationMs = Date.now() - tStart;
      delivery.turbo = true;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(delivery));
    } catch (err) {
      console.error('[Turbo Direct-Pipe Error]:', err.message);
      try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch (e) {}
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Headless Renderer HTML endpoint
  if (req.method === 'GET' && pathname === '/render/page') {
    const configPath = path.join(__dirname, 'current_config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderPageHtml(config));
    return;
  }

  // Trigger Render & Ingestion API (ProRes 4444 Alpha)
  if (req.method === 'POST' && (pathname === '/api/render-motion' || pathname === '/api/render')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const config = JSON.parse(body || '{}');
        const actualCat = (config.cat && config.cat !== 'update') ? config.cat : (config.mode !== 'update' ? config.mode : 'viral');
        const actualSub = config.subType || config.sub || 'kinetic_slam';
        console.log(`[Studio Render] Mode: ${actualCat} | Sub: ${actualSub} | FPS: ${config.fps} | Dur: ${config.duration}s | IsUpdate: ${Boolean(config.updateMode)}`);

        fs.writeFileSync(path.join(__dirname, 'current_config.json'), JSON.stringify(config, null, 2));

        // Clean frames dir
        fs.readdirSync(FRAMES_DIR).forEach(f => {
          try { fs.unlinkSync(path.join(FRAMES_DIR, f)); } catch (e) {}
        });

        const browserBin = findBrowserExecutable();
        if (!browserBin) {
          throw new Error('USE_CLIENT_RENDER');
        }

        const renderUrl = `http://localhost:${PORT}/render/page`;
        const tmpUserData = path.join(os.tmpdir(), 'cherry_chrome_' + Date.now());
        const chrome = spawn(browserBin, [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          `--user-data-dir=${tmpUserData}`,
          renderUrl
        ], { windowsHide: true });

        const turboResult = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            try { chrome.kill(); } catch(e){}
            try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch(e){}
            reject(new Error("USE_CLIENT_RENDER"));
          }, 30000);

          currentRender = { resolve, reject, timeout, chrome, tmpUserData };
        });

        const result = turboResult || await encodeAndDeliver(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } catch (err) {
        console.warn('Headless render notice (falling back if needed):', err.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'USE_CLIENT_RENDER' }));
      }
    });
    return;
  }

  // Update Clip (Hot-Swap In-Place) API
  if (req.method === 'POST' && pathname === '/api/update-clip') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const config = JSON.parse(body || '{}');
        config.updateMode = true;
        config.action = 'update';

        const actualCat = (config.cat && config.cat !== 'update') ? config.cat : (config.mode !== 'update' ? config.mode : 'viral');
        const actualSub = config.subType || config.sub || 'kinetic_slam';
        console.log(`[Studio Update Clip] Mode: ${actualCat} | Sub: ${actualSub} | Target: ${config.targetClipMediaPath}`);

        fs.writeFileSync(path.join(__dirname, 'current_config.json'), JSON.stringify(config, null, 2));

        // Clean frames dir
        fs.readdirSync(FRAMES_DIR).forEach(f => {
          try { fs.unlinkSync(path.join(FRAMES_DIR, f)); } catch (e) {}
        });

        const browserBin = findBrowserExecutable();
        if (!browserBin) {
          throw new Error('USE_CLIENT_RENDER');
        }

        const renderUrl = `http://localhost:${PORT}/render/page`;
        const tmpUserData = path.join(os.tmpdir(), 'cherry_chrome_' + Date.now());
        const chrome = spawn(browserBin, [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          `--user-data-dir=${tmpUserData}`,
          renderUrl
        ], { windowsHide: true });

        const turboResult = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            try { chrome.kill(); } catch(e){}
            try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch(e){}
            reject(new Error("USE_CLIENT_RENDER"));
          }, 30000);

          currentRender = { resolve, reject, timeout, chrome, tmpUserData };
        });

        const result = turboResult || await encodeAndDeliver(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } catch (err) {
        console.warn('Update clip notice (falling back if needed):', err.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'USE_CLIENT_RENDER' }));
      }
    });
    return;
  }

  // Render Finished Signal
  if (req.method === 'POST' && pathname === '/render/done') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let data = null;
      try { data = JSON.parse(body); } catch(e){}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      if (currentRender) {
        clearTimeout(currentRender.timeout);
        try { currentRender.chrome.kill(); } catch(e){}
        if (currentRender.tmpUserData) {
          try { fs.rmSync(currentRender.tmpUserData, { recursive: true, force: true }); } catch(e){}
        }
        currentRender.resolve(data);
        currentRender = null;
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

function renderPageHtml(config) {
  const actualCat = (config.cat && config.cat !== 'update') ? config.cat : (config.mode !== 'update' ? config.mode : 'viral');
  const actualSub = config.subType || config.sub || 'kinetic_slam';
  const fps = config.fps || 29.97;
  const duration = config.duration || 3.0;
  const totalFrames = Math.ceil(duration * fps);
  const cfgJson = JSON.stringify(config).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Allura&family=Bodoni+Moda:ital,opsz,wght@0,6..96,600;0,6..96,700;0,6..96,900;1,6..96,600&family=Cinzel:wght@600;700;900&family=Cormorant+Garamond:ital,wght@0,600;0,700;1,400;1,600&family=Great+Vibes&family=Italianno&family=Montserrat:wght@400;700;900&family=Oswald:wght@700&family=Parisienne&family=Pinyon+Script&family=Playfair+Display:ital,wght@0,600;0,800;0,900;1,400;1,700&family=Plus+Jakarta+Sans:wght@700;800&family=Prata&family=Syne:wght@700;800&display=swap" rel="stylesheet">
  <style>
    @font-face { font-family: 'Coolvetica'; src: url('/fonts/Coolvetica-Rg.otf') format('opentype'), local('Coolvetica Rg'), local('Coolvetica'); font-display: block; }
    @font-face { font-family: 'MADE TOMMY'; src: url('/fonts/MADE-TOMMY-ExtraBold.otf') format('opentype'), url('/fonts/MADE-TOMMY-Regular.otf') format('opentype'), local('MADE TOMMY ExtraBold'), local('made-tommy'); font-display: block; }
    @font-face { font-family: 'SF Pro Display'; src: url('/fonts/SF-Pro-Display-Bold.otf') format('opentype'), local('SF Pro Display Bold'), local('SFPRODISPLAYBOLD'); font-display: block; }
    @font-face { font-family: 'Zuume'; src: url('/fonts/Zuume-Bold.ttf') format('truetype'), local('Zuume Bold'), local('Zuume'); font-display: block; }
  </style>
</head>
<body style="margin:0; background:transparent;">
<canvas id="c" width="1600" height="900"></canvas>
<script src="/engine.js"></script>
<script>
  const config = ${cfgJson};
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const FPS = ${fps};
  const TOTAL_FRAMES = ${totalFrames};
  const cat = "${actualCat}";
  const sub = "${actualSub}";

  async function processAll() {
    try { await CherryEngine.preload(cat, sub, config); } catch (e) {}
    try { await document.fonts.ready; } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
    const blobs = [];
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const u = i / FPS;
      CherryEngine.draw(ctx, cat, sub, u, config);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      blobs.push(blob);
    }
    const combined = new Blob(blobs, { type: 'application/octet-stream' });
    const turboRes = await fetch('/api/turbo-render?config=' + encodeURIComponent(JSON.stringify(config)), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-cherry-config': encodeURIComponent(JSON.stringify(config))
      },
      body: combined
    });
    const resData = await turboRes.json();
    await fetch('/render/done', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resData)
    });
  }

  setTimeout(processAll, 300);
</script>
</body>
</html>`;
}

process.on('uncaughtException', (err) => {
  console.error('[Server UncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server UnhandledRejection]', reason);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Server] Port ${PORT} already in use, retrying in 1.5s...`);
    setTimeout(() => {
      try { server.close(); } catch(e){}
      server.listen(PORT, () => {
        console.log(`[Portable Engine] Cherry Motion Studio listening on http://localhost:${PORT}`);
      });
    }, 1500);
  } else {
    console.error('[Server Error]', err);
  }
});

server.listen(PORT, () => {
  console.log(`[Portable Engine] Cherry Motion Studio listening on http://localhost:${PORT}`);
});
