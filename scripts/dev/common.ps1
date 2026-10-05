# Shared settings for the native dev fallback (used when Docker is not installed).
# Dot source this file: . "$PSScriptRoot\common.ps1"
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script:DevDir = Join-Path $RepoRoot ".dev"
$script:BinDir = Join-Path $DevDir "bin"
$script:PgData = Join-Path $DevDir "pgdata"
$script:LogDir = Join-Path $DevDir "logs"
$script:PidDir = Join-Path $DevDir "pids"

# Never 5432: that port may belong to another Postgres on this machine.
$script:PgPort = 5433
$script:PgUser = "leafy"
$script:PgDatabase = "leafy"
$script:PgBin = if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }

# Throwaway local dev password. Override with LEAFY_DEV_PG_PASSWORD. Never reuse it anywhere real.
$script:PgPassword = if ($env:LEAFY_DEV_PG_PASSWORD) { $env:LEAFY_DEV_PG_PASSWORD } else { "leafy-dev-only" }

$script:MinioPort = 9000
$script:MinioConsolePort = 9001

function Initialize-DevDirs {
    foreach ($dir in @($DevDir, $BinDir, $LogDir, $PidDir)) {
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    }
}

function Get-PgTool([string]$name) {
    $path = Join-Path $PgBin "$name.exe"
    if (-not (Test-Path $path)) { throw "Missing $path. Set PG_BIN to your PostgreSQL 17 bin folder." }
    return $path
}

function Test-PortListening([int]$port) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    return [bool]$conn
}

function Save-ProcessId([string]$name, [int]$processId) {
    Set-Content -Path (Join-Path $PidDir "$name.pid") -Value $processId
}

function Stop-SavedProcess([string]$name) {
    $file = Join-Path $PidDir "$name.pid"
    if (-not (Test-Path $file)) { Write-Host "$name is not tracked as running."; return }
    $savedId = [int](Get-Content $file)
    $proc = Get-Process -Id $savedId -ErrorAction SilentlyContinue
    if ($proc) {
        # /T also stops child processes (uv run spawns python as a child)
        & taskkill.exe /PID $savedId /T /F | Out-Null
        Write-Host "Stopped $name (pid $savedId)."
    }
    Remove-Item $file -Force
}

# pg_ctl start through Start-Process so the server does not inherit the caller's stdout/stderr
# pipes (otherwise a calling shell or CI step waits forever for the server to exit).
function Start-LocalPostgres {
    if (Test-PortListening $PgPort) { throw "Port $PgPort is already in use by something else." }
    $pgCtl = Get-PgTool "pg_ctl"
    $ctlArgs = @("-D", "`"$PgData`"", "-l", "`"$(Join-Path $LogDir 'postgres.log')`"",
        "-o", "`"-p $PgPort -c listen_addresses=127.0.0.1`"", "-w", "start")
    # No -Wait: it also waits for the long lived server child. Poll the port instead.
    $proc = Start-Process -FilePath $pgCtl -ArgumentList $ctlArgs -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening $PgPort) { return }
        if ($proc.HasExited -and $proc.ExitCode -ne 0) { break }
        Start-Sleep -Milliseconds 300
    }
    throw "Postgres did not start in time, see $LogDir\postgres.log"
}
