$ErrorActionPreference = 'Continue'

Write-Host "=== Iniciando ngrok en background ==="
$ngrokProcess = Start-Process -FilePath "ngrok" -ArgumentList @('http', '3001') -PassThru -RedirectStandardError "C:\temp\ngrok-stderr.log" -RedirectStandardOutput "C:\temp\ngrok-stdout.log" -WindowStyle Hidden

Write-Host "PID: $($ngrokProcess.Id)"

Write-Host "=== Esperando 3 segundos para que ngrok inicie ==="
Start-Sleep -Seconds 3

Write-Host "=== Intentando consultar API de ngrok ==="
try {
  $response = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 5 -ErrorAction Stop
  Write-Host "API Response:"
  Write-Host ($response | ConvertTo-Json -Depth 10)
}
catch {
  Write-Host "Error consultando API: $($_.Exception.Message)"
  Write-Host "Error Type: $($_.Exception.GetType().FullName)"
}

Write-Host "=== Verificando si proceso sigue corriendo ==="
if ($ngrokProcess.HasExited) {
  Write-Host "ERROR: Proceso de ngrok ya termino"
}
else {
  Write-Host "Proceso ngrok sigue corriendo"
}

Write-Host "=== Leyendo logs de ngrok ==="
if (Test-Path "C:\temp\ngrok-stdout.log") {
  Write-Host "--- STDOUT ---"
  Get-Content "C:\temp\ngrok-stdout.log"
}

if (Test-Path "C:\temp\ngrok-stderr.log") {
  Write-Host "--- STDERR ---"
  Get-Content "C:\temp\ngrok-stderr.log"
}

Write-Host "=== Deteniendo ngrok ==="
Stop-Process -Id $ngrokProcess.Id -Force -ErrorAction SilentlyContinue

Write-Host "Done"
