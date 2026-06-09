@echo off
chcp 65001 > nul
echo 正在啟動本地伺服器...
echo.
echo 遊戲地址: http://localhost:8000
echo 按 Ctrl+C 停止伺服器
echo.
python -m http.server 8000
