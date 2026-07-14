# Build and start the prelegal stack, then wait until it answers.
$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

Write-Host 'Waiting for http://localhost:8000 ' -NoNewline
foreach ($_ in 1..60) {
    try {
        Invoke-WebRequest -Uri 'http://localhost:8000/api/health' -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host ''
        Write-Host 'Prelegal is running at http://localhost:8000'
        exit 0
    } catch {
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 1
    }
}

Write-Host ''
Write-Error 'Timed out waiting for the backend. Recent logs:'
docker compose logs --tail 40
exit 1
