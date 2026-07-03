param(
  [string]$NgrokCmd = 'ngrok',
  [string]$NgrokDomain = '',
  [string]$AppCmd = 'npm',
  [string[]]$AppArgs = @('start')
)
$ErrorActionPreference = 'Stop'

function Stop-NgrokProcesses {
  $running = Get-Process ngrok -ErrorAction SilentlyContinue
  if ($running) {
    Write-Host "Closing previous ngrok tunnels..."
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400
  }
}

function FindNgrok {
  $c = Get-Command ngrok -ErrorAction SilentlyContinue
  if ($c -and $c.Source) { return $c.Source }
  return $NgrokCmd
}

function GetNgrokArgs {
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

function GetNgrokUrl {
  param([int]$ProcessId, [int]$Timeout = 45)
  $end = [DateTime]::UtcNow.AddSeconds($Timeout)
  $try = 0
  while ([DateTime]::UtcNow -lt $end) {
    $try++
    foreach ($port in 4040..4045) {
      try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/tunnels" -TimeoutSec 1 -ErrorAction Stop
        if ($r.tunnels -and $r.tunnels.Count -gt 0) {
          foreach ($t in $r.tunnels) {
            if ($t.public_url -like 'https://*') { return $t.public_url.TrimEnd('/') }
          }
        }
      }
      catch { }
    }
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { throw 'ngrok process ended' }
    if ($try % 5 -eq 0) { Write-Host "  Retry $try..." }
    Start-Sleep -Milliseconds 300
  }
  throw 'ngrok timeout'
}

Write-Host ""
Write-Host "MercadoPG ngrok Tunnel"
Write-Host "====================="
Write-Host ""

$cmd = FindNgrok
if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw 'ngrok not found' }

Stop-NgrokProcesses

Write-Host "Starting ngrok on port 3001..."
$ngrokArgs = GetNgrokArgs -Domain $NgrokDomain
$p = Start-Process -FilePath $cmd -ArgumentList $ngrokArgs -PassThru
Write-Host "PID: $($p.Id)"
Write-Host ""

try {
  Write-Host "Getting public URL..."
  $url = GetNgrokUrl -ProcessId $p.Id
  Write-Host "URL: $url"
  Write-Host ""
  $env:MERCADOPG_PUBLIC_URL = $url
  $env:EXPO_PUBLIC_MERCADOPG_URL = $url
  try {
    Set-Clipboard -Value $url
    Write-Host "URL copiada al portapapeles"
  }
  catch {
    Write-Host "No se pudo copiar al portapapeles (continuando)"
  }
  Write-Host "====================="
  Write-Host "PUBLIC URL: $url"
  Write-Host "EXPO_PUBLIC_MERCADOPG_URL: $url"
  Write-Host "====================="
  Write-Host ""
  & $AppCmd @AppArgs
}
finally {
  if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
}
