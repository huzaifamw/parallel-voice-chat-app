param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d{1,3}(\.\d{1,3}){3}$')]
  [string]$LanIp,
  [switch]$ConfigureSupabase,
  [switch]$StartServer
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$liveKitDirectory = Join-Path $projectRoot 'infrastructure\livekit'
$functionEnvPath = Join-Path $projectRoot 'supabase\functions\.env'
$liveKitEnvPath = Join-Path $liveKitDirectory '.env'
$apiKey = 'parallel_' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(8)).ToLowerInvariant()
$apiSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48)).Replace('+', '-').Replace('/', '_').TrimEnd('=')
$webhookUrl = 'https://iwqczndtabzuxwcgrzfy.supabase.co/functions/v1/livekit-webhook'

@"
LIVEKIT_NODE_IP=$LanIp
LIVEKIT_API_KEY=$apiKey
LIVEKIT_API_SECRET=$apiSecret
LIVEKIT_WEBHOOK_URL=$webhookUrl
"@ | Set-Content -LiteralPath $liveKitEnvPath -Encoding utf8

@"
LIVEKIT_URL=ws://${LanIp}:7880
LIVEKIT_API_KEY=$apiKey
LIVEKIT_API_SECRET=$apiSecret
"@ | Set-Content -LiteralPath $functionEnvPath -Encoding utf8

if ($ConfigureSupabase) {
  Push-Location $projectRoot
  try {
    & npx.cmd supabase@2.121.0 secrets set --env-file $functionEnvPath
    if ($LASTEXITCODE -ne 0) { throw 'Supabase rejected the LiveKit function secrets.' }
  } finally {
    Pop-Location
  }
}

if ($StartServer) {
  Push-Location $liveKitDirectory
  try {
    & docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw 'Docker could not start the LiveKit server.' }
  } finally {
    Pop-Location
  }
}

Write-Host 'LiveKit development configuration created.'
Write-Host "Signaling URL: ws://${LanIp}:7880"
Write-Host 'Secrets were written only to ignored server-side environment files.'
