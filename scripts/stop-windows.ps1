# Stop the prelegal stack. The database lives in the container, so stopping
# discards it and the next start comes up with an empty schema.
$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

docker compose down
if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed' }
Write-Host 'Prelegal stopped.'
