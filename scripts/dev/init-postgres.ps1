# Initialise a project local PostgreSQL 17 cluster in .dev\pgdata (port 5433), start it, and
# create the "leafy" database with the citext and pg_trgm extensions. Safe to re-run.
. "$PSScriptRoot\common.ps1"
Initialize-DevDirs

$initdb = Get-PgTool "initdb"
$psql = Get-PgTool "psql"

if (-not (Test-Path (Join-Path $PgData "PG_VERSION"))) {
    $pwFile = Join-Path $DevDir "pgpass.tmp"
    try {
        Set-Content -Path $pwFile -Value $PgPassword -NoNewline
        & $initdb -D $PgData -U $PgUser --pwfile=$pwFile -A scram-sha-256 -E UTF8 --locale=C
        if ($LASTEXITCODE -ne 0) { throw "initdb failed" }
    }
    finally {
        if (Test-Path $pwFile) { Remove-Item $pwFile -Force }
    }
} else {
    Write-Host "Cluster already initialised at $PgData"
}

if (-not (Test-Path (Join-Path $PgData "postmaster.pid"))) {
    Start-LocalPostgres
}

$env:PGPASSWORD = $PgPassword
# Hide harmless "already exists" NOTICEs (stderr output would trip ErrorActionPreference Stop).
$env:PGOPTIONS = "-c client_min_messages=warning"
try {
    $exists = & $psql -h 127.0.0.1 -p $PgPort -U $PgUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$PgDatabase'"
    if ($exists -ne "1") {
        & $psql -h 127.0.0.1 -p $PgPort -U $PgUser -d postgres -c "CREATE DATABASE $PgDatabase"
        if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE failed" }
    }
    & $psql -h 127.0.0.1 -p $PgPort -U $PgUser -d $PgDatabase -c "CREATE EXTENSION IF NOT EXISTS citext" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
    if ($LASTEXITCODE -ne 0) { throw "CREATE EXTENSION failed" }
}
finally {
    Remove-Item Env:\PGPASSWORD, Env:\PGOPTIONS -ErrorAction SilentlyContinue
}

Write-Host "Postgres ready: postgresql+asyncpg://${PgUser}:<dev password>@127.0.0.1:$PgPort/$PgDatabase"
