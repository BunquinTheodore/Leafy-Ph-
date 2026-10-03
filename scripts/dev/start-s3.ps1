# Start an S3 compatible server on 127.0.0.1:9000 and create the two Leafy buckets.
#
# Preferred: a local moto server (python, from the api dev dependencies; in memory, data is lost on
# stop). If you have placed a minio.exe in .dev\bin it is used instead (API 9000, console 9001,
# data in .dev\minio-data). MinIO binaries are no longer published upstream, see
# download-binaries.ps1.
. "$PSScriptRoot\common.ps1"
Initialize-DevDirs
if (Test-PortListening $MinioPort) { Write-Host "Port $MinioPort already in use, S3 may already be running."; return }

$minioExe = Join-Path $BinDir "minio.exe"
$buckets = @("leafy-scans", "leafy-catalog")
$logOut = Join-Path $LogDir "s3.out.log"
$logErr = Join-Path $LogDir "s3.err.log"

if (Test-Path $minioExe) {
    $data = Join-Path $DevDir "minio-data"
    if (-not (Test-Path $data)) { New-Item -ItemType Directory -Path $data | Out-Null }
    $env:MINIO_ROOT_USER = if ($env:MINIO_ROOT_USER) { $env:MINIO_ROOT_USER } else { "minioadmin" }
    $env:MINIO_ROOT_PASSWORD = if ($env:MINIO_ROOT_PASSWORD) { $env:MINIO_ROOT_PASSWORD } else { "minioadmin-dev-only" }
    $serverArgs = @("server", $data, "--address", "127.0.0.1:$MinioPort", "--console-address", "127.0.0.1:$MinioConsolePort")
    $proc = Start-Process -FilePath $minioExe -ArgumentList $serverArgs `
        -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden -PassThru
    $kind = "minio"
} else {
    $uv = (Get-Command uv -ErrorAction SilentlyContinue)
    if (-not $uv) { throw "uv not found on PATH (needed to run the moto S3 server)." }
    $apiDir = Join-Path $RepoRoot "api"
    $serverArgs = @("run", "--project", $apiDir, "moto_server", "-H", "127.0.0.1", "-p", "$MinioPort")
    $proc = Start-Process -FilePath $uv.Source -ArgumentList $serverArgs `
        -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden -PassThru
    $kind = "moto"
}
Save-ProcessId "s3" $proc.Id

$deadline = (Get-Date).AddSeconds(45)
while (-not (Test-PortListening $MinioPort)) {
    if ((Get-Date) -gt $deadline -or $proc.HasExited) { throw "S3 server ($kind) did not start, see $logErr" }
    Start-Sleep -Milliseconds 400
}

# Create buckets (idempotent) through boto3 from the api environment.
$py = "import boto3,sys`n" +
    "c=boto3.client('s3',endpoint_url='http://127.0.0.1:$MinioPort',aws_access_key_id='dev',aws_secret_access_key='dev-only-secret',region_name='us-east-1')`n" +
    "[c.create_bucket(Bucket=b) for b in sys.argv[1:] if b not in {x['Name'] for x in c.list_buckets()['Buckets']}]`n" +
    "print('buckets:',[x['Name'] for x in c.list_buckets()['Buckets']])"
& uv run --project (Join-Path $RepoRoot "api") python -c $py @buckets
if ($LASTEXITCODE -ne 0) { throw "Bucket creation failed" }
Write-Host "S3 ($kind) started (pid $($proc.Id)) on http://127.0.0.1:$MinioPort"
