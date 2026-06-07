# Debug script para ngrok
Write-Host 'Test: Iniciando ngrok directamente...'
$p = Start-Process -FilePath 'ngrok' -ArgumentList @('http', '3001', '--log=stdout') -PassThru
Write-Host "PID: $($p.Id)"
Write-Host "Process started, waiting 3 seconds..."
Start-Sleep -Seconds 3

Write-Host 'Test: Consultando API...'
try {
  $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2 -ErrorAction Stop
  Write-Host "Success! Tunnels encontrados: $($resp.tunnels.Count)"
  if ($resp.tunnels.Count -gt 0) {
    $resp.tunnels | ForEach-Object {
      Write-Host "  URL: $($_.public_url)"
    }
  }
} catch {
  Write-Host "Error API: $($_.Exception.Message)"
}

Write-Host "Deteniendo ngrok..."
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Write-Host "Done"
