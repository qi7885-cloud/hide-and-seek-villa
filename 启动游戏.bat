@echo off
chcp 65001 >nul
title 你藏我找
cd /d "%~dp0"
echo 正在启动本地服务器...
start "" "http://127.0.0.1:8080"
node server.js
if errorlevel 1 (
  echo.
  echo 启动失败：请确认已安装 Node.js  https://nodejs.org
  pause
)
