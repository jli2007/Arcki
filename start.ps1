# PowerShell script to start both backend and frontend servers
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"

Write-Host "Starting Delta Architecture 3D Generation Server..." -ForegroundColor Green
Write-Host ""

# Check if venv exists
if (-not (Test-Path "server\venv")) {
    Write-Host "Error: Virtual environment not found at server\venv" -ForegroundColor Red
    Write-Host "Please create it first with: cd server; python -m venv venv" -ForegroundColor Yellow
    exit 1
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& "server\venv\Scripts\Activate.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to activate virtual environment" -ForegroundColor Red
    exit 1
}

Write-Host "Virtual environment activated" -ForegroundColor Green
Write-Host ""

# Function to cleanup on exit
function Cleanup {
    Write-Host ""
    Write-Host "Shutting down servers..." -ForegroundColor Yellow
    if ($backendProcess) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProcess) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Servers stopped" -ForegroundColor Green
}

# Set up cleanup on script exit
Register-EngineEvent PowerShell.Exiting -Action { Cleanup } | Out-Null

# Start backend server
Write-Host "Starting backend server on http://localhost:8000..." -ForegroundColor Green
Set-Location server
$backendProcess = Start-Process python -ArgumentList "server.py" -PassThru -NoNewWindow
Set-Location ..

# Wait a moment for backend to start
Start-Sleep -Seconds 2

if ($backendProcess.HasExited) {
    Write-Host "Backend server failed to start" -ForegroundColor Red
    exit 1
}

# Start frontend server
Write-Host "Starting frontend server on http://localhost:3000..." -ForegroundColor Green
Set-Location client
$frontendProcess = Start-Process npm -ArgumentList "run", "dev" -PassThru -NoNewWindow
Set-Location ..

Write-Host ""
Write-Host "✓ Backend running on http://localhost:8000 (PID: $($backendProcess.Id))" -ForegroundColor Green
Write-Host "✓ Frontend running on http://localhost:3000 (PID: $($frontendProcess.Id))" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Yellow
Write-Host ""

# Wait for both processes
try {
    Wait-Process -Id $backendProcess.Id, $frontendProcess.Id
} catch {
    Cleanup
}
