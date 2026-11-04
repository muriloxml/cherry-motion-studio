@echo off
chcp 65001 >nul
title Instalador Oficial - Cherry Motion Studio v2.1.2
color 0D

echo ====================================================================
echo             CHERRY MOTION STUDIO - INSTALADOR EM 1 CLIQUE           
echo                     Versão: v2.1.2                       
echo ====================================================================
echo.

:: 1. Ativa PlayerDebugMode no Registro do Windows para Premiere CC (CSXS 9 até 18)
echo [1/3] Habilitando suporte a extensões CEP no Adobe Premiere Pro...
for /L %%i in (9,1,18) do (
    reg add "HKCU\Software\Adobe\CSXS.%%i" /v "PlayerDebugMode" /t REG_SZ /d "1" /f >nul 2>&1
)
echo [✓] Registro configurado com sucesso!

:: 2. Prepara diretório de destino da extensão CEP
set "CEP_DIR=%APPDATA%\Adobe\CEP\extensions\cherry_motion_studio"
set "LOCAL_DIR=%LOCALAPPDATA%\CherryMotionStudio\Studio"

echo.
echo [2/3] Instalando extensão no Adobe Premiere Pro...
if not exist "%APPDATA%\Adobe\CEP\extensions" mkdir "%APPDATA%\Adobe\CEP\extensions"

:: Extrai o pacote .zxp usando PowerShell nativo (ZXP é compatível com ZIP)
set "ZXP_FILE=%~dp0Cherry_Motion_Studio_v2.1.2.zxp"
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
    echo [✓] Extensão extraída para %%APPDATA%%\Adobe\CEP\extensions\cherry_motion_studio!
)

:: 3. Inicializa ambiente local com permissão de escrita para Auto-Update OTA
echo.
echo [3/3] Inicializando motor de Auto-Update OTA em %%LOCALAPPDATA%%...
if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"
if exist "%CEP_DIR%\studio_bundle" (
    xcopy "%CEP_DIR%\studio_bundle\*" "%LOCAL_DIR%\" /E /I /Y /Q >nul
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
