@echo off
chcp 65001 >nul
title 你藏我找
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   启动失败：电脑上还没有安装 Node.js
  echo   请到 https://nodejs.org/zh-cn 下载安装（选 LTS 版），
  echo   装好后重新双击"启动游戏.bat"即可开玩。
  echo.
  pause
  exit /b 1
)

set PORT=3000
echo 正在启动本地服务器，浏览器将自动打开游戏页面...
echo 若未自动打开，请手动访问 http://127.0.0.1:3000
echo 游玩期间请保持本窗口开启；想退出就关掉本窗口。
echo.
start "" /b cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:3000"
node server.js

echo.
echo 服务器已停止。
pause
