# Starts Postgres (if not already running) and the FastAPI dev server.
# Run from anywhere: powershell -ExecutionPolicy Bypass -File start.ps1
# Or right-click > Run with PowerShell.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$pgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
$pgData = Join-Path $here "pgdata"

Write-Host "Starting Postgres on port 5433..." -ForegroundColor Cyan
$status = & $pgCtl -D $pgData status 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  already running" -ForegroundColor Green
} else {
    & $pgCtl -D $pgData -o "-p 5433" -l (Join-Path $here "pgdata.log") start
}

Write-Host ""
Write-Host "Starting API on http://localhost:8000 (docs at /docs)..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the API. Postgres will keep running in the background." -ForegroundColor DarkGray
Write-Host ""

& ".\venv\Scripts\uvicorn.exe" app.main:app --reload --port 8000