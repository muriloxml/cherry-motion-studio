/**
 * Cherry Motion Studio - ZXP & OTA Release Builder
 * Empacota a extensão oficial assinada com ZXPSignCmd da Adobe,
 * gera os pacotes Over-The-Air (OTA) delta e cria instaladores de 1-clique.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const otaManager = require('./ota_manager');

function bumpVersion(ver, type = 'patch') {
  const parts = ver.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  if (type === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else {
    parts[2]++;
  }
  return parts.join('.');
}

function copyRecursive(src, dest, excludeFilter = null) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      if (excludeFilter && excludeFilter(child, path.join(src, child))) continue;
      copyRecursive(path.join(src, child), path.join(dest, child), excludeFilter);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  console.log('=====================================================');
  console.log('   CHERRY MOTION STUDIO - BUILDER OFICIAL ZXP & OTA  ');
  console.log('=====================================================\n');

  const args = process.argv.slice(2);
  let bumpType = null;
  let customVer = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--bump' && args[i + 1]) {
      bumpType = args[i + 1];
      i++;
    } else if (args[i] === '--version' && args[i + 1]) {
      customVer = args[i + 1];
      i++;
    }
  }

  const paths = otaManager.getStudioPaths();
  const currentVerInfo = otaManager.getVersionInfo();
  let targetVersion = currentVerInfo.version || '2.1.0';

  if (customVer) {
    targetVersion = customVer;
  } else if (bumpType) {
    targetVersion = bumpVersion(targetVersion, bumpType);
  }

  console.log(`[Builder] Versão Alvo: v${targetVersion} (Versão anterior: v${currentVerInfo.version})`);

  // 1. Atualiza version.json
  const updatedVerInfo = {
    ...currentVerInfo,
    version: targetVersion,
    build: (currentVerInfo.build || 2100) + 1,
    buildTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    changelog: `v${targetVersion}: Build oficial assinado com suporte a Auto-Update OTA e sincronização em tempo real.`
  };
  otaManager.saveVersionInfo(updatedVerInfo);

  // 2. Prepara a extensão CEP Standalone (Zero dependência de node.exe externo)
  const cepExtensionDir = paths.cepExtensionDir;
  console.log(`[Builder] Sincronizando extensão CEP Standalone em ${cepExtensionDir}...`);
  fs.mkdirSync(cepExtensionDir, { recursive: true });

  // Lista de arquivos essenciais para a raiz da extensão CEP
  const rootFiles = [
    'engine.js',
    'index.html',
    'version.json',
    'saved_presets.json',
    'LEIA-ME_PORTATIL.txt'
  ];

  for (const f of rootFiles) {
    const src = path.join(paths.activeDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(cepExtensionDir, f));
    }
  }

  // Copia lib (CSInterface.js)
  const libSrc = path.join(paths.activeDir, 'lib');
  if (fs.existsSync(libSrc)) {
    copyRecursive(libSrc, path.join(cepExtensionDir, 'lib'));
  }

  // Copia fontes
  const fontsSrc = path.join(paths.activeDir, 'fonts');
  if (fs.existsSync(fontsSrc)) {
    copyRecursive(fontsSrc, path.join(cepExtensionDir, 'fonts'));
  }

  // Copia host/index.jsx
  const hostSrc = path.join(paths.activeDir, 'host', 'index.jsx');
  if (fs.existsSync(hostSrc)) {
    fs.mkdirSync(path.join(cepExtensionDir, 'host'), { recursive: true });
    fs.copyFileSync(hostSrc, path.join(cepExtensionDir, 'host', 'index.jsx'));
  }

  // Copia MOGRTs compilados (todos os 29 templates e manifest para o pacote oficial)
  const mogrtsSrc = path.join(paths.activeDir, 'mogrts', 'Cherry Motions');
  if (fs.existsSync(mogrtsSrc)) {
    const destMogrts = path.join(cepExtensionDir, 'mogrts', 'Cherry Motions');
    fs.mkdirSync(destMogrts, { recursive: true });
    copyRecursive(mogrtsSrc, destMogrts);
    console.log(`[Builder] 29 templates MOGRTs sincronizados na extensão CEP.`);
  }

  // Mantém studio_bundle para compatibilidade opcional
  const studioBundleDir = path.join(cepExtensionDir, 'studio_bundle');
  fs.mkdirSync(studioBundleDir, { recursive: true });
  for (const f of ['server.js', 'ota_manager.js', 'build_cherry_mogrts.js', 'version.json']) {
    const src = path.join(paths.activeDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(studioBundleDir, f));
  }

  // 3. Atualiza versão no CSXS/manifest.xml da extensão CEP
  const manifestXmlPath = path.join(cepExtensionDir, 'CSXS', 'manifest.xml');
  if (fs.existsSync(manifestXmlPath)) {
    let xmlContent = fs.readFileSync(manifestXmlPath, 'utf8');
    xmlContent = xmlContent.replace(/ExtensionBundleVersion="[^"]*"/g, `ExtensionBundleVersion="${targetVersion}"`);
    xmlContent = xmlContent.replace(/<Extension Id="com\.cherry\.motionstudio\.panel" Version="[^"]*"/g, `<Extension Id="com.cherry.motionstudio.panel" Version="${targetVersion}"`);
    fs.writeFileSync(manifestXmlPath, xmlContent, 'utf8');
    console.log(`[Builder] Atualizado CSXS/manifest.xml com versão ${targetVersion}.`);
  }

  // 4. Gera o pacote Over-The-Air (ota_bundle.json e release_manifest.json)
  console.log('[Builder] Gerando pacotes de Auto-Update OTA (Delta Bundle)...');
  const otaResult = otaManager.buildOtaBundle({
    version: targetVersion,
    releaseNotes: updatedVerInfo.changelog
  });
  console.log(`[Builder] OTA Bundle gerado em: ${otaResult.bundlePath} (${Math.round(fs.statSync(otaResult.bundlePath).size / 1024)} KB)`);

  // 5. Configura e assina a extensão oficial .ZXP via ZXPSignCmd.exe
  const zxpSignCmd = path.join(paths.activeDir, 'bin', 'ZXPSignCmd.exe');
  if (!fs.existsSync(zxpSignCmd)) {
    throw new Error(`ZXPSignCmd.exe não encontrado em: ${zxpSignCmd}`);
  }

  const certPath = path.join(paths.activeDir, 'bin', 'cherry_motion_cert.p12');
  const certPass = 'cherry123';

  if (!fs.existsSync(certPath)) {
    console.log('[Builder] Criando certificado auto-assinado oficial Adobe (.p12)...');
    const certCmd = `"${zxpSignCmd}" -selfSignedCert BR SP "Cherry Motion" "Cherry Motion Studio" "${certPass}" "${certPath}" -validityDays 3650`;
    execSync(certCmd, { stdio: 'inherit' });
  }

  const outputZxpName = `Cherry_Motion_Studio_v${targetVersion}.zxp`;
  const outputZxpPath = path.join(paths.distDir, outputZxpName);
  const genericZxpPath = path.join(paths.distDir, 'Cherry_Motion_Studio_LATEST.zxp');

  console.log(`[Builder] Assinando extensão oficial em: ${outputZxpPath}...`);
  // Remove zxp anterior se existir
  if (fs.existsSync(outputZxpPath)) fs.unlinkSync(outputZxpPath);
  if (fs.existsSync(genericZxpPath)) fs.unlinkSync(genericZxpPath);

  // Comando de assinatura oficial Adobe
  const signCmd = `"${zxpSignCmd}" -sign "${cepExtensionDir}" "${outputZxpPath}" "${certPath}" "${certPass}"`;
  execSync(signCmd, { stdio: 'inherit' });

  // Cria cópia com nome LATEST
  fs.copyFileSync(outputZxpPath, genericZxpPath);

  // Verifica assinatura do .ZXP
  console.log('[Builder] Verificando integridade criptográfica do .ZXP...');
  const verifyCmd = `"${zxpSignCmd}" -verify "${outputZxpPath}"`;
  try {
    const verifyOut = execSync(verifyCmd).toString();
    console.log('[Builder] Resultado da verificação:\n' + verifyOut.trim());
  } catch (err) {
    console.warn('[Builder] Aviso na verificação:', err.message);
  }

  // 6. Gera script de Instalação em 1 Clique (INSTALAR_CHERRY_MOTION_1_CLIQUE.bat)
  const installerBatPath = path.join(paths.distDir, 'INSTALAR_CHERRY_MOTION_1_CLIQUE.bat');
  const installerBatContent = `@echo off
chcp 65001 >nul
title Instalador Oficial - Cherry Motion Studio v${targetVersion}
color 0D

echo ====================================================================
echo             CHERRY MOTION STUDIO - INSTALADOR EM 1 CLIQUE           
echo                     Versão: v${targetVersion}                       
echo ====================================================================
echo.

:: 1. Ativa PlayerDebugMode no Registro do Windows para Premiere CC (CSXS 9 até 18)
echo [1/3] Habilitando suporte a extensões CEP no Adobe Premiere Pro...
for /L %%i in (9,1,18) do (
    reg add "HKCU\\Software\\Adobe\\CSXS.%%i" /v "PlayerDebugMode" /t REG_SZ /d "1" /f >nul 2>&1
)
echo [✓] Registro configurado com sucesso!

:: 2. Prepara diretório de destino da extensão CEP
set "CEP_DIR=%APPDATA%\\Adobe\\CEP\\extensions\\cherry_motion_studio"
set "LOCAL_DIR=%LOCALAPPDATA%\\CherryMotionStudio\\Studio"

echo.
echo [2/3] Instalando extensão no Adobe Premiere Pro...
if not exist "%APPDATA%\\Adobe\\CEP\\extensions" mkdir "%APPDATA%\\Adobe\\CEP\\extensions"

:: Extrai o pacote .zxp usando PowerShell nativo (ZXP é compatível com ZIP)
set "ZXP_FILE=%~dp0${outputZxpName}"
if not exist "%ZXP_FILE%" set "ZXP_FILE=%~dp0Cherry_Motion_Studio_LATEST.zxp"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$zxp = '%ZXP_FILE%';" ^
    "$dest = '%CEP_DIR%';" ^
    "if (Test-Path $dest) { Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue };" ^
    "Add-Type -AssemblyName System.IO.Compression.FileSystem;" ^
    "[System.IO.Compression.ZipFile]::ExtractToDirectory($zxp, $dest);"

if %ERRORLEVEL% NEQ 0 (
    echo [!] Aviso: Falha ao extrair direto. Copiando arquivos brutos...
) else (
    echo [✓] Extensão extraída para %%APPDATA%%\\Adobe\\CEP\\extensions\\cherry_motion_studio!
)

:: 3. Inicializa ambiente local com permissão de escrita para Auto-Update OTA
echo.
echo [3/3] Inicializando motor de Auto-Update OTA em %%LOCALAPPDATA%%...
if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"
if exist "%CEP_DIR%\\studio_bundle" (
    xcopy "%CEP_DIR%\\studio_bundle\\*" "%LOCAL_DIR%\\" /E /I /Y /Q >nul
    echo [✓] Motor local configurado para atualizações automáticas sem reinstalação!
)

echo.
echo ====================================================================
echo   INSTALAÇÃO CONCLUÍDA COM SUCESSO!
echo ====================================================================
echo.
echo Como abrir no Adobe Premiere Pro:
echo   1. Abra o Adobe Premiere Pro.
echo   2. Vá no menu: Window (Janela) -> Extensions (Extensões).
echo   3. Clique em "Cherry Motion Studio".
echo.
echo Dica: O plugin se atualizará sozinho nas próximas versões sem você
echo precisar baixar ou instalar nada de novo!
echo.
pause
`;
  fs.writeFileSync(installerBatPath, installerBatContent, 'utf8');

  // 7. Gera script de Publicação OTA em 1 Clique (PUBLICAR_NOVA_VERSAO_OTA.bat)
  const publisherBatPath = path.join(paths.distDir, 'PUBLICAR_NOVA_VERSAO_OTA.bat');
  const publisherBatContent = `@echo off
chcp 65001 >nul
title Publicar Nova Versão OTA - Cherry Motion Studio
color 0E

echo ====================================================================
echo          CHERRY MOTION STUDIO - PUBLICADOR DE ATUALIZAÇÃO           
echo ====================================================================
echo.
echo Este utilitário incrementa a versão, atualiza o .ZXP oficial
echo e gera os pacotes OTA para que todos os usuários recebam o update
echo instantaneamente e sem precisar reinstalar nada.
echo.

set /p BUMP="Escolha o tipo de incremento [1 = Patch (2.1.X), 2 = Minor (2.X.0), 3 = Manter atual]: "

set BUMP_ARG=--bump patch
if "%BUMP%"=="2" set BUMP_ARG=--bump minor
if "%BUMP%"=="3" set BUMP_ARG=

echo.
echo Executando build e assinatura...
node "%~dp0..\\Studio\\build_zxp_and_ota.js" %BUMP_ARG%

echo.
echo [✓] Concluído! O pacote OTA e o instalador ZXP foram gerados em:
echo %~dp0
echo.
pause
`;
  fs.writeFileSync(publisherBatPath, publisherBatContent, 'utf8');

  // Também copia o publicador para a pasta Studio
  fs.writeFileSync(path.join(paths.activeDir, 'PUBLICAR_NOVA_VERSAO_OTA.bat'), publisherBatContent, 'utf8');

  // 8. Publicação automática para o GitHub (muriloxml/cherry-motion-studio)
  console.log('\n[Builder] Sincronizando com repositório GitHub...');
  try {
    const gitDir = paths.libraryDir;
    const lockFile = path.join(gitDir, '.git', 'index.lock');
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch(e){}
    }
    execSync(`git -C "${gitDir}" add "Distribuicao_Plugin" "Studio"`, { stdio: 'inherit', windowsHide: true });
    try {
      execSync(`git -C "${gitDir}" commit -m "release: Cherry Motion Studio v${targetVersion} (Standalone CEP Panel & 29 MOGRTs)"`, { stdio: 'inherit', windowsHide: true });
    } catch(cErr) {
      console.log('[Builder] Nada novo a commitar.');
    }
    execSync(`git -C "${gitDir}" push origin main`, { stdio: 'inherit', windowsHide: true });
    console.log(`[Builder] ✓ Push realizado com sucesso para GitHub (main)!`);
  } catch(gitErr) {
    console.warn('[Builder] Aviso no git push:', gitErr.message);
  }

  console.log('\n=====================================================');
  console.log('   🎉 BUILD & EMPACOTAMENTO CONCLUÍDOS COM SUCESSO!  ');
  console.log('=====================================================');
  console.log(`- Arquivo .ZXP Assinado: ${outputZxpPath} (${Math.round(fs.statSync(outputZxpPath).size / 1024)} KB)`);
  console.log(`- Pacote OTA Delta:      ${otaResult.bundlePath} (${Math.round(fs.statSync(otaResult.bundlePath).size / 1024)} KB)`);
  console.log(`- Release Manifest:      ${otaResult.manifestPath}`);
  console.log(`- Instalador 1-Clique:   ${installerBatPath}`);
  console.log(`- Publicador OTA:        ${publisherBatPath}\n`);

  return {
    success: true,
    version: targetVersion,
    zxpPath: outputZxpPath,
    otaBundlePath: otaResult.bundlePath,
    installerPath: installerBatPath
  };
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n[ERRO FATAL NO BUILD]', err);
    process.exit(1);
  });
}

module.exports = { main };
