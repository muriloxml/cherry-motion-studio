@echo off
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
node "%~dp0..\Studio\build_zxp_and_ota.js" %BUMP_ARG%

echo.
echo [✓] Concluído! O pacote OTA e o instalador ZXP foram gerados em:
echo %~dp0
echo.
pause
