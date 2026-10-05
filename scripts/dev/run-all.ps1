# Run the whole Leafy stack natively (no Docker): Postgres 5433, S3 (moto) 9000,
# the FastAPI API on 8000 and the Next.js production build on 3000.
#
#   .\scripts\dev\run-all.ps1                 start everything (ML_SERVICE=dev-fake)
#   .\scripts\dev\run-all.ps1 -MlService stub the real, unimplemented ML stub (scans fail with ml_unavailable)
#   .\scripts\dev\run-all.ps1 -E2E            also turn rate limits off and start a second stack with
#                                             ML_SERVICE=stub (API 8001, web 3001) for the full stack tests
#   .\scripts\dev\run-all.ps1 -SkipBuild      reuse the last `next build`
#   .\scripts\dev\run-all.ps1 -Stop           stop the API and web servers and the dev services
#   .\scripts\dev\run-all.ps1 -Stop -KeepInfra   stop only the API and web servers (Postgres and S3 stay up)
#
# Logs: .dev\logs. Everything here is local development only: throwaway secrets, mock Google,
# and the dev-fake predictor (which refuses to run when ENV=prod).
param(
    [ValidateSet("dev-fake", "stub")] [string]$MlService = "dev-fake",
    [switch]$E2E,
    [switch]$SkipBuild,
    [switch]$Stop,
    [switch]$KeepInfra
)
. "$PSScriptRoot\common.ps1"
Initialize-DevDirs

$ApiDir = Join-Path $RepoRoot "api"
$AppDir = Join-Path $RepoRoot "app"
$ApiPort = 8000
$WebPort = 3000
$StubApiPort = 8001
$StubWebPort = 3001
$serviceNames = @("api", "web", "api-stub", "web-stub")

if ($Stop) {
    foreach ($name in $serviceNames) { Stop-SavedProcess $name }
    if (-not $KeepInfra) { & "$PSScriptRoot\dev-down.ps1" }
    return
}

function Wait-Http([string]$url, [string]$name, [int]$seconds = 90) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -lt 500) { return }
        } catch {
            if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 500) { return }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$name did not become ready at $url, see $LogDir"
}

function Start-Leafy([string]$name, [string]$file, [string[]]$arguments, [string]$workDir) {
    Stop-SavedProcess $name
    $proc = Start-Process -FilePath $file -ArgumentList $arguments -WorkingDirectory $workDir `
        -RedirectStandardOutput (Join-Path $LogDir "$name.out.log") `
        -RedirectStandardError (Join-Path $LogDir "$name.err.log") -WindowStyle Hidden -PassThru
    Save-ProcessId $name $proc.Id
    Write-Host "$name started (pid $($proc.Id))"
}

# --- Shared environment (inherited by every process started below) ---
$env:DATABASE_URL = "postgresql+asyncpg://${PgUser}:${PgPassword}@127.0.0.1:${PgPort}/${PgDatabase}"
$env:JWT_SECRET = "leafy-local-dev-only-jwt-secret-0123456789"
$env:ENV = "dev"
$env:S3_ENDPOINT_URL = "http://127.0.0.1:$MinioPort"
$env:S3_PUBLIC_ENDPOINT = "http://127.0.0.1:$MinioPort"
$env:S3_ACCESS_KEY = "dev"
$env:S3_SECRET_KEY = "dev-only-secret"
$env:GOOGLE_MOCK = "1"
$env:ALLOW_INSECURE_MOCKS = "1"
# Mock Google (Firebase) sign in. The web builds the mock ID token itself and the API verifies it, so
# both sides must agree on the project id. These are throwaway local values, not real Firebase config.
$env:FIREBASE_PROJECT_ID = "leafy-mock"
$env:NEXT_PUBLIC_AUTH_MOCK = "1"
$env:NEXT_PUBLIC_FIREBASE_PROJECT_ID = "leafy-mock"
$env:NEXT_PUBLIC_FIREBASE_API_KEY = "local-mock-api-key"
$env:NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "leafy-mock.firebaseapp.com"
$env:NEXT_PUBLIC_FIREBASE_APP_ID = "1:000000000000:web:local-mock"
$env:RATE_LIMIT_ENABLED = $(if ($E2E) { "false" } else { "true" })
$env:COOKIE_SECURE = "false"
$env:COOKIE_PREFIX = ""

Write-Host "1/5 infrastructure (Postgres, S3)"
& "$PSScriptRoot\dev-up.ps1"

Write-Host "2/5 migrations and seed data"
Push-Location $ApiDir
try {
    & uv run alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "alembic upgrade head failed" }
    & uv run python -m app.seeds
    if ($LASTEXITCODE -ne 0) { throw "seed load failed" }
} finally { Pop-Location }

Write-Host "3/5 API on :$ApiPort (ML_SERVICE=$MlService)"
$python = Join-Path $ApiDir ".venv\Scripts\python.exe"
$env:APP_ORIGIN = "http://127.0.0.1:$WebPort"
$env:ML_SERVICE = $MlService
Start-Leafy "api" $python @("-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", "$ApiPort") $ApiDir
Wait-Http "http://127.0.0.1:$ApiPort/api/v1/health" "API"

if ($E2E) {
    $env:APP_ORIGIN = "http://127.0.0.1:$StubWebPort"
        $env:ML_SERVICE = "stub"
    Start-Leafy "api-stub" $python @("-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", "$StubApiPort") $ApiDir
    Wait-Http "http://127.0.0.1:$StubApiPort/api/v1/health" "stub API"
}

Write-Host "4/5 web build"
$env:API_INTERNAL_URL = "http://127.0.0.1:$ApiPort"
$env:APP_ORIGIN = "http://127.0.0.1:$WebPort"
if (-not $SkipBuild) {
    Push-Location $AppDir
    try {
        & pnpm exec next build
        if ($LASTEXITCODE -ne 0) { throw "next build failed" }
    } finally { Pop-Location }
}

Write-Host "5/5 web on :$WebPort"
$nextBin = Join-Path $AppDir "node_modules\next\dist\bin\next"
Start-Leafy "web" "node" @($nextBin, "start", "-p", "$WebPort") $AppDir
Wait-Http "http://127.0.0.1:$WebPort/" "web"

if ($E2E) {
    $env:API_INTERNAL_URL = "http://127.0.0.1:$StubApiPort"
    $env:APP_ORIGIN = "http://127.0.0.1:$StubWebPort"
        Start-Leafy "web-stub" "node" @($nextBin, "start", "-p", "$StubWebPort") $AppDir
    Wait-Http "http://127.0.0.1:$StubWebPort/" "stub web"
}

Write-Host ""
Write-Host "Leafy is running:"
Write-Host "  App      http://127.0.0.1:$WebPort"
Write-Host "  API      http://127.0.0.1:$ApiPort/docs"
if ($E2E) { Write-Host "  Stub ML  app http://127.0.0.1:$StubWebPort, api http://127.0.0.1:$StubApiPort" }
Write-Host "Stop with: .\scripts\dev\run-all.ps1 -Stop"
