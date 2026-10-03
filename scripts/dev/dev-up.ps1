# One shot native dev stack: Postgres (5433), S3 (9000), Mailpit (1025/8025).
$ErrorActionPreference = "Stop"
& "$PSScriptRoot\init-postgres.ps1"
& "$PSScriptRoot\download-binaries.ps1"
& "$PSScriptRoot\start-s3.ps1"
& "$PSScriptRoot\start-mailpit.ps1"
