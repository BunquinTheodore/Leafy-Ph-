# Start the project local Postgres cluster (port 5433). Run init-postgres.ps1 first.
. "$PSScriptRoot\common.ps1"
Initialize-DevDirs
if (-not (Test-Path (Join-Path $PgData "PG_VERSION"))) { throw "No cluster yet. Run scripts\dev\init-postgres.ps1" }
if (Test-Path (Join-Path $PgData "postmaster.pid")) { Write-Host "Postgres already running on $PgPort."; return }
Start-LocalPostgres
