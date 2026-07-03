#!/usr/bin/env powershell
param(
  [string]$NgrokCommand = 'ngrok',
  [string]$NgrokDomain = '',
  [string]$PortableExePath = '',
  [string]$UnpackedExePath = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-NgrokCommand {
  $cmd = Get-Command ngrok -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  return $NgrokCommand
}

function Get-NgrokArgumentList {
  param([string]$Domain)

  $effectiveDomain = String($Domain).Trim()
  if (-not $effectiveDomain) {
    $effectiveDomain = String($env:MERCADOPG_NGROK_DOMAIN).Trim()
  }

  $args = @('http')
  if ($effectiveDomain) {
    # ngrok reserved domain (paid plan): keeps a stable HTTPS URL.
    $args += @('--url', $effectiveDomain)
  }
  $args += '3001'
  return $args
}

function Stop-NgrokProcesses {
  $running = Get-Process ngrok -ErrorAction SilentlyContinue
  if ($running) {
    Write-Host "Cerrando tuneles ngrok anteriores..."
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 350
  }
}

function Get-NgrokPublicUrl {
  param([int]$ProcessId, [int]$TimeoutSeconds = 45)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

  while ([DateTime]::UtcNow -lt $deadline) {
    foreach ($port in 4040..4045) {
      try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/tunnels" -TimeoutSec 1 -ErrorAction Stop
        if ($resp.tunnels -and $resp.tunnels.Count -gt 0) {
          foreach ($t in $resp.tunnels) {
            if ($t.public_url -like 'https://*') {
              return $t.public_url.TrimEnd('/')
            }
          }
        }
      }
      catch { }
    }

    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
      throw 'El proceso ngrok termino antes de entregar URL publica'
    }
    Start-Sleep -Milliseconds 300
  }

  throw 'Timeout esperando URL publica de ngrok'
}

function Resolve-AppExe {
  param([string]$Root)

  $candidates = @()
  if ($PortableExePath) {
    $candidates += $PortableExePath
  }
  if ($UnpackedExePath) {
    $candidates += $UnpackedExePath
  }

  $candidates += @(
    (Join-Path $Root 'dist-portable\MercadoPG 1.0.0.exe'),
    (Join-Path $Root 'dist\win-unpacked\MercadoPG.exe'),
    (Join-Path $Root 'dist-portable\win-unpacked\MercadoPG.exe')
  )

  foreach ($exe in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($exe) -and (Test-Path $exe)) {
      return (Resolve-Path $exe).Path
    }
  }

  throw 'No se encontro ejecutable de MercadoPG. Genera primero el build desktop.'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')

Write-Host ''
Write-Host '=================================================='
Write-Host ' MercadoPG Desktop + ngrok'
Write-Host '=================================================='
Write-Host ''

$ngrokCmd = Resolve-NgrokCommand
if (-not (Get-Command $ngrokCmd -ErrorAction SilentlyContinue)) {
  throw 'ngrok no encontrado. Instala ngrok y configura tu authtoken.'
}

$appExe = Resolve-AppExe -Root $repoRoot
Write-Host "Ejecutable: $appExe"

Stop-NgrokProcesses
Write-Host 'Iniciando ngrok en puerto 3001...'
$ngrokArgs = Get-NgrokArgumentList -Domain $NgrokDomain
$ngrokProc = Start-Process -FilePath $ngrokCmd -ArgumentList $ngrokArgs -PassThru

try {
  $url = Get-NgrokPublicUrl -ProcessId $ngrokProc.Id
  $env:MERCADOPG_PUBLIC_URL = $url
  $env:NGROK_URL = $url
  $env:EXPO_PUBLIC_MERCADOPG_URL = $url

  try {
    Set-Clipboard -Value $url
    Write-Host "URL publica copiada al portapapeles: $url"
  }
  catch {
    Write-Host "URL publica: $url"
  }

  Write-Host 'Abriendo MercadoPG...'
  Start-Process -FilePath $appExe -Wait
}
finally {
  if ($ngrokProc -and -not $ngrokProc.HasExited) {
    Stop-Process -Id $ngrokProc.Id -Force -ErrorAction SilentlyContinue
  }
}
