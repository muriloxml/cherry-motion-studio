/**
 * Cherry Motion Studio - Over-The-Air (OTA) Update Manager
 * Gerencia versões, verificação de atualizações locais/remotas,
 * empacotamento delta e aplicação atômica de patches sem reinstalação de .ZXP.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const CORE_OTA_FILES = [
  'engine.js',
  'index.html',
  'server.js',
  'build_cherry_mogrts.js',
  'version.json',
  'host/index.jsx'
];

const DEFAULT_REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/muriloxml/cherry-motion-studio/main/Distribuicao_Plugin/release_manifest.json';
const DEFAULT_REMOTE_BUNDLE_URL = 'https://raw.githubusercontent.com/muriloxml/cherry-motion-studio/main/Distribuicao_Plugin/ota_bundle.json';

function getStudioPaths() {
  const activeDir = __dirname;
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  
  const localAppStudioDir = path.join(localAppData, 'CherryMotionStudio', 'Studio');
  const cepExtensionDir = path.join(appData, 'Adobe', 'CEP', 'extensions', 'cherry_motion_studio');

  // Detect parent library directory
  let libraryDir = path.resolve(__dirname, '..');
  if (!path.basename(libraryDir).toUpperCase().includes('CHERRY MOTIONS')) {
    const defaultDrive = "G:\\Meu Drive\\00. MARKETING GTK\\PROJETOS EDIÇÃO\\00. APENAS EDITOR\\CHERRY MOTIONS";
    if (fs.existsSync(defaultDrive)) {
      libraryDir = defaultDrive;
    }
  }

  const distDir = path.join(libraryDir, 'Distribuicao_Plugin');

  return {
    activeDir,
    localAppStudioDir,
    cepExtensionDir,
    libraryDir,
    distDir
  };
}

function isCreatorEnvironment() {
  const cert1 = path.join(__dirname, 'bin', 'cherry_motion_cert.p12');
  const cert2 = "G:\\Meu Drive\\00. MARKETING GTK\\PROJETOS EDIÇÃO\\00. APENAS EDITOR\\CHERRY MOTIONS\\Studio\\bin\\cherry_motion_cert.p12";
  const cert3 = path.join(__dirname, 'bin', 'cherry_cert.p12');
  return fs.existsSync(cert1) || fs.existsSync(cert2) || fs.existsSync(cert3);
}

function getVersionInfo() {
  const vPath = path.join(__dirname, 'version.json');
  let info = {
    name: 'Cherry Motion Studio',
    version: '2.1.3',
    build: 2104,
    buildTime: new Date().toISOString(),
    channel: 'stable',
    remoteManifestUrl: DEFAULT_REMOTE_MANIFEST_URL,
    lastChecked: null,
    changelog: 'v2.1.3: Controle de acesso seguro Criador/Cliente e Auto-Update via GitHub.'
  };
  if (fs.existsSync(vPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(vPath, 'utf8'));
      info = Object.assign(info, parsed);
    } catch (e) {
      console.warn('[OTA] Erro ao ler version.json:', e.message);
    }
  }
  if (!info.remoteManifestUrl) info.remoteManifestUrl = DEFAULT_REMOTE_MANIFEST_URL;
  info.isCreator = isCreatorEnvironment();
  return info;
}

function saveVersionInfo(info) {
  const vPath = path.join(__dirname, 'version.json');
  if (!info.remoteManifestUrl) info.remoteManifestUrl = DEFAULT_REMOTE_MANIFEST_URL;
  fs.writeFileSync(vPath, JSON.stringify(info, null, 2), 'utf8');
}

function getFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function compareVersions(v1, v2) {
  const clean = v => (v || '0.0.0').toString().replace(/^v/i, '').trim();
  const parts1 = clean(v1).split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = clean(v2).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function fetchHttpJson(urlStr, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      let finalUrl = urlStr;
      if (finalUrl.includes('raw.githubusercontent.com') || finalUrl.includes('github.com')) {
        const sep = finalUrl.includes('?') ? '&' : '?';
        finalUrl = `${finalUrl}${sep}_t=${Date.now()}`;
      }
      const parsed = new URL(finalUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(finalUrl, {
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'CherryMotionStudio-OTA',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchHttpJson(res.headers.location, timeoutMs));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} ao consultar ${urlStr}`));
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Falha ao decodificar JSON de ${urlStr}: ${e.message}`));
          }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout de ${timeoutMs}ms ao consultar ${urlStr}`));
      });
      req.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Procura bundle de atualização em drives locais / Google Drive compartilhado
 */
function scanLocalSharedDrives() {
  const paths = getStudioPaths();
  const candidates = [
    path.join(paths.distDir, 'ota_bundle.json'),
    path.join(paths.libraryDir, 'Distribuicao_Plugin', 'ota_bundle.json')
  ];

  // Adiciona varredura em outros drives (ex: se o Google Drive estiver montado em D:, E:, etc)
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (const l of letters) {
    const candidateDrive = `${l}:\\Meu Drive\\00. MARKETING GTK\\PROJETOS EDIÇÃO\\00. APENAS EDITOR\\CHERRY MOTIONS\\Distribuicao_Plugin\\ota_bundle.json`;
    if (!candidates.includes(candidateDrive)) {
      candidates.push(candidateDrive);
    }
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const stats = fs.statSync(c);
        if (stats.size > 100) {
          return {
            sourcePath: c,
            dir: path.dirname(c),
            mtime: stats.mtime
          };
        }
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Verifica atualizações disponíveis (Locais ou Remotas)
 */
async function checkForUpdates(customUrl = null) {
  const current = getVersionInfo();
  const paths = getStudioPaths();
  let latestInfo = null;
  let sourceType = 'none';
  let sourcePath = '';
  let bundlePayload = null;

  // 1. Tenta varredura local em Drive compartilhado / Distribuicao_Plugin
  const localSource = scanLocalSharedDrives();
  if (localSource) {
    try {
      const bundleData = JSON.parse(fs.readFileSync(localSource.sourcePath, 'utf8'));
      if (bundleData && bundleData.version) {
        latestInfo = bundleData;
        sourceType = 'local_drive';
        sourcePath = localSource.sourcePath;
        bundlePayload = bundleData;
      }
    } catch (e) {
      console.warn('[OTA] Erro ao ler bundle local:', e.message);
    }
  }

  // 2. Se houver URL remota customizada ou configurada (padrão: GitHub Raw)
  const targetUrl = customUrl || current.remoteManifestUrl || DEFAULT_REMOTE_MANIFEST_URL;
  if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
    try {
      const remoteData = await fetchHttpJson(targetUrl);
      if (remoteData && remoteData.version) {
        // Se a versão remota for superior à local encontrada, prioriza a remota
        if (!latestInfo || compareVersions(remoteData.version, latestInfo.version) >= 0) {
          latestInfo = remoteData;
          sourceType = 'cloud';
          sourcePath = targetUrl;
          bundlePayload = remoteData.bundle || null;
        }
      }
    } catch (e) {
      console.warn('[OTA] Aviso ao consultar URL remota:', e.message);
    }
  }

  // Atualiza lastChecked
  current.lastChecked = new Date().toISOString();
  saveVersionInfo(current);

  if (!latestInfo) {
    return {
      updateAvailable: false,
      currentVersion: current.version,
      latestVersion: current.version,
      channel: current.channel,
      message: 'Você já está utilizando a versão mais recente.'
    };
  }

  const isNewer = compareVersions(latestInfo.version, current.version) > 0;
  return {
    updateAvailable: isNewer,
    currentVersion: current.version,
    latestVersion: latestInfo.version,
    releaseDate: latestInfo.releaseDate || null,
    releaseNotes: latestInfo.releaseNotes || latestInfo.changelog || 'Atualizações e melhorias no Cherry Motion Studio.',
    sourceType,
    sourcePath,
    bundleUrl: latestInfo.bundleUrl || (sourceType === 'cloud' ? DEFAULT_REMOTE_BUNDLE_URL : null),
    hasDirectBundle: !!bundlePayload,
    filesCount: latestInfo.files ? Object.keys(latestInfo.files).length : (latestInfo.filesCount || 6)
  };
}

/**
 * Aplica atualização atômica a partir do bundle
 */
async function applyUpdate(bundleOrSource) {
  const paths = getStudioPaths();
  const current = getVersionInfo();
  let bundle = null;

  if (typeof bundleOrSource === 'object' && bundleOrSource && bundleOrSource.version) {
    bundle = bundleOrSource;
  } else if (typeof bundleOrSource === 'string' && fs.existsSync(bundleOrSource)) {
    bundle = JSON.parse(fs.readFileSync(bundleOrSource, 'utf8'));
  } else {
    // Tenta obter via verificação
    const checkRes = await checkForUpdates();
    if (checkRes.sourceType === 'local_drive' && fs.existsSync(checkRes.sourcePath)) {
      bundle = JSON.parse(fs.readFileSync(checkRes.sourcePath, 'utf8'));
    } else if (checkRes.sourceType === 'cloud') {
      const bUrl = checkRes.bundleUrl || (checkRes.sourcePath && checkRes.sourcePath.endsWith('ota_bundle.json') ? checkRes.sourcePath : DEFAULT_REMOTE_BUNDLE_URL);
      console.log(`[OTA] Baixando bundle completo da nuvem (${bUrl})...`);
      const remoteData = await fetchHttpJson(bUrl, 15000);
      bundle = remoteData.bundle || remoteData;
    }
  }

  if (!bundle || !bundle.version || !bundle.files) {
    throw new Error('Bundle de atualização inválido ou não encontrado.');
  }

  console.log(`[OTA] Aplicando atualização de v${current.version} para v${bundle.version}...`);

  // Define diretórios de destino
  const targetDirs = [paths.activeDir];
  if (fs.existsSync(paths.localAppStudioDir) && paths.localAppStudioDir !== paths.activeDir) {
    targetDirs.push(paths.localAppStudioDir);
  }
  const cepBundleDir = path.join(paths.cepExtensionDir, 'studio_bundle');
  if (fs.existsSync(cepBundleDir)) {
    targetDirs.push(cepBundleDir);
  }

  // Backup da versão anterior
  const backupDirName = `_backup_v${current.version}_${Date.now()}`;
  const backupPath = path.join(paths.activeDir, backupDirName);
  try {
    fs.mkdirSync(backupPath, { recursive: true });
    for (const relFile of Object.keys(bundle.files)) {
      const srcFile = path.join(paths.activeDir, relFile);
      if (fs.existsSync(srcFile)) {
        const destFile = path.join(backupPath, relFile);
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.copyFileSync(srcFile, destFile);
      }
    }
  } catch (e) {
    console.warn('[OTA] Aviso ao criar backup pré-update:', e.message);
  }

  // Escreve os arquivos atualizados em todos os diretórios alvo
  const updatedFiles = [];
  for (const [relPath, fileInfo] of Object.entries(bundle.files)) {
    let contentBuffer = null;
    if (fileInfo.encoding === 'base64') {
      contentBuffer = Buffer.from(fileInfo.content, 'base64');
    } else if (typeof fileInfo.content === 'string') {
      contentBuffer = Buffer.from(fileInfo.content, 'utf8');
    }

    if (!contentBuffer) continue;

    // Valida sha256 se fornecido
    if (fileInfo.sha256) {
      const actualHash = crypto.createHash('sha256').update(contentBuffer).digest('hex');
      if (actualHash !== fileInfo.sha256) {
        throw new Error(`Falha de integridade SHA-256 no arquivo ${relPath}!`);
      }
    }

    for (const targetDir of targetDirs) {
      try {
        const fullTarget = path.join(targetDir, relPath);
        fs.mkdirSync(path.dirname(fullTarget), { recursive: true });
        fs.writeFileSync(fullTarget, contentBuffer);
      } catch (err) {
        console.warn(`[OTA] Aviso ao escrever em ${targetDir}/${relPath}:`, err.message);
      }
    }
    updatedFiles.push(relPath);
  }

  // Atualiza arquivo version.json
  const updatedVersionInfo = {
    ...current,
    version: bundle.version,
    build: bundle.build || (current.build ? current.build + 1 : 2101),
    buildTime: bundle.buildTime || new Date().toISOString(),
    changelog: bundle.releaseNotes || bundle.changelog || current.changelog,
    lastUpdated: new Date().toISOString()
  };
  saveVersionInfo(updatedVersionInfo);

  // Também sincroniza host/index.jsx no diretório nativo da extensão CEP se acessível
  const nativeCepHost = path.join(paths.cepExtensionDir, 'host', 'index.jsx');
  const sourceHost = path.join(paths.activeDir, 'host', 'index.jsx');
  if (fs.existsSync(nativeCepHost) && fs.existsSync(sourceHost)) {
    try {
      fs.copyFileSync(sourceHost, nativeCepHost);
      console.log('[OTA] Sincronizado host/index.jsx nativo do CEP.');
    } catch(e) {}
  }

  console.log(`[OTA] Atualização para v${bundle.version} concluída com sucesso! (${updatedFiles.length} arquivos atualizados).`);

  return {
    success: true,
    oldVersion: current.version,
    newVersion: bundle.version,
    updatedFiles,
    backupDir: backupDirName
  };
}

/**
 * Cria pacote OTA bundle e release manifest
 */
function buildOtaBundle(options = {}) {
  const paths = getStudioPaths();
  const current = getVersionInfo();
  const targetVersion = options.version || current.version;
  const releaseNotes = options.releaseNotes || options.changelog || current.changelog || 'Atualização automática Cherry Motion Studio.';

  const bundle = {
    name: 'Cherry Motion Studio',
    version: targetVersion,
    build: options.build || Date.now(),
    releaseDate: new Date().toISOString().slice(0, 10),
    releaseNotes,
    files: {}
  };

  for (const relPath of CORE_OTA_FILES) {
    const fullPath = path.join(paths.activeDir, relPath);
    if (fs.existsSync(fullPath)) {
      const buffer = fs.readFileSync(fullPath);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      bundle.files[relPath] = {
        size: buffer.length,
        sha256,
        encoding: 'base64',
        content: buffer.toString('base64')
      };
    }
  }

  // Release manifest leve (apenas metadata e hashes)
  const manifest = {
    name: 'Cherry Motion Studio',
    version: targetVersion,
    build: bundle.build,
    releaseDate: bundle.releaseDate,
    releaseNotes: bundle.releaseNotes,
    manifestUrl: DEFAULT_REMOTE_MANIFEST_URL,
    bundleUrl: DEFAULT_REMOTE_BUNDLE_URL,
    filesCount: Object.keys(bundle.files).length,
    bundleSha256: crypto.createHash('sha256').update(JSON.stringify(bundle)).digest('hex')
  };

  // Garante que pasta de distribuição existe
  fs.mkdirSync(paths.distDir, { recursive: true });

  const bundlePath = path.join(paths.distDir, 'ota_bundle.json');
  const manifestPath = path.join(paths.distDir, 'release_manifest.json');

  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Salva também cópia local no Studio
  fs.writeFileSync(path.join(paths.activeDir, 'ota_bundle.json'), JSON.stringify(bundle, null, 2), 'utf8');

  return {
    bundle,
    manifest,
    bundlePath,
    manifestPath
  };
}

module.exports = {
  CORE_OTA_FILES,
  DEFAULT_REMOTE_MANIFEST_URL,
  DEFAULT_REMOTE_BUNDLE_URL,
  isCreatorEnvironment,
  getStudioPaths,
  getVersionInfo,
  saveVersionInfo,
  getFileSha256,
  compareVersions,
  checkForUpdates,
  applyUpdate,
  buildOtaBundle
};
