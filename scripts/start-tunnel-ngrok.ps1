#!/usr/bin/env powershell
param(
  [string]$NgrokCommand = 'ngrok',
  [string]$AppCommand = 'npm',
  [string[]]$AppArgs = @('start')
)

$ErrorActionPreference = 'Stop'

function Stop-NgrokProcesses {
  $running = Get-Process ngrok -ErrorAction SilentlyContinue
  if ($running) {
    Write-Host "Cerrando tuneles ngrok anteriores..."
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400
  }
}

function Resolve-NgrokCommand {
  $cmd = Get-Command ngrok -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  return $NgrokCommand
}

function Get-NgrokPublicUrl {
  param([int]$ProcessId, [int]$TimeoutSeconds = 45)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $attempts = 0
  
  while ([DateTime]::UtcNow -lt $deadline) {
    $attempts++
    foreach ($port in 4040..4045) {
      try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/tunnels" -TimeoutSec 1 -ErrorAction Stop
        if ($resp.tunnels -and $resp.tunnels.Count -gt 0) {
          foreach ($tunnel in $resp.tunnels) {
            if ($tunnel.public_url -like 'https://*') {
              return $tunnel.public_url.TrimEnd('/')
            }
          }
        }
      }
      catch { }
    }
    
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
      throw "Proceso ngrok termino"
    }
    
    if ($attempts % 5 -eq 0) { Write-Host "  Reintentando... ($attempts)" }
    Start-Sleep -Milliseconds 300
  }
  throw "Timeout esperando URL de ngrok"
}

Write-Host ""
Write-Host "=================================================="
Write-Host " MercadoPG - ngrok Tunnel"
Write-Host "=================================================="
Write-Host ""

$NgrokCmd = Resolve-NgrokCommand
if (-not (Get-Command $NgrokCmd -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: ngrok no encontrado"
  exit 1
}

Stop-NgrokProcesses

Write-Host "Iniciando ngrok en puerto 3001..."
$proc = Start-Process -FilePath $NgrokCmd -ArgumentList @('http', '3001') -PassThru
Write-Host "PID: $($proc.Id)"
Write-Host ""

try {
  Write-Host "Esperando URL publica..."
  $url = Get-NgrokPublicUrl -ProcessId $proc.Id
  Write-Host "OK: $url"
  Write-Host ""
  
  $env:MERCADOPG_PUBLIC_URL = $url
    $env:EXPO_PUBLIC_MERCADOPG_URL = $url
    try {
      Set-Clipboard -Value $url
      Write-Host "URL copied to clipboard"
    } catch {
      Write-Host "Clipboard copy failed (continuing)"
    }
  
  Write-Host "=================================================="
  Write-Host " URL PUBLICA: $url"
    Write-Host "EXPO_PUBLIC_MERCADOPG_URL: $url"
  Write-Host "=================================================="
  Write-Host ""
  
  & $AppCommand @AppArgs
} catch {
  Write-Host "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}
