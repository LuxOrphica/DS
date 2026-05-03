# Запускает smart-home-shop в Docker и открывает постоянный тоннель через zrok
#
# Использование: .\tools\start_shop_internet.ps1
# Публичный адрес: https://delaemseti.share.zrok.io

param(
  [string]$ZrokExe  = "C:\Users\Александр\Downloads\zrok_1.1.11_windows_amd64\zrok.exe",
  [string]$Token    = "delaemseti",
  [int]   $LocalPort = 3030
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

# --- 1. Docker: сборка и запуск ---
Write-Host "[shop] Запуск Docker контейнера..."
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose up завершился с ошибкой" }

# Ждём готовности приложения
Write-Host "[shop] Ожидаю порт $LocalPort..."
$ok = $false
for ($i = 1; $i -le 20; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$LocalPort/api/products" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { }
  Write-Host "[shop] Ожидание... ($i/20)"
}
if (-not $ok) { throw "Приложение не ответило. Проверьте: docker compose logs" }
Write-Host "[shop] Приложение готово."

# --- 2. zrok: постоянный тоннель ---
Write-Host ""
Write-Host "=========================================="
Write-Host "  Публичный адрес: https://$Token.share.zrok.io"
Write-Host "=========================================="
Write-Host ""
& $ZrokExe share reserved $Token
