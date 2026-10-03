# Stop the project local Postgres cluster.
. "$PSScriptRoot\common.ps1"
if (-not (Test-Path (Join-Path $PgData "postmaster.pid"))) { Write-Host "Postgres is not running."; return }
& (Get-PgTool "pg_ctl") -D $PgData -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw "pg_ctl stop failed" }
