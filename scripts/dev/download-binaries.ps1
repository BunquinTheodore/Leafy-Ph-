# Download the Mailpit Windows binary into .dev\bin. Skips it if it already exists.
#
# MinIO: the upstream MinIO project is archived and dl.min.io returns 410 Gone for its Windows
# binary, so it is NOT downloaded here. start-s3.ps1 uses a local moto S3 server instead (from the
# api dev dependencies), or a minio.exe you place in .dev\bin yourself.
. "$PSScriptRoot\common.ps1"
Initialize-DevDirs
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$mailpitUrl = "https://github.com/axllent/mailpit/releases/latest/download/mailpit-windows-amd64.zip"

$mailpitExe = Join-Path $BinDir "mailpit.exe"
if (-not (Test-Path $mailpitExe)) {
    Write-Host "Downloading Mailpit..."
    $zip = Join-Path $DevDir "mailpit.zip"
    $extract = Join-Path $DevDir "mailpit-extract"
    try {
        Invoke-WebRequest -Uri $mailpitUrl -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $extract -Force
        Copy-Item (Join-Path $extract "mailpit.exe") $mailpitExe
    }
    finally {
        Remove-Item $zip -Force -ErrorAction SilentlyContinue
        Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    }
}

& $mailpitExe version
