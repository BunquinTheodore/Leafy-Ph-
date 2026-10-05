# One shot native dev stack: Postgres (5433) and S3 (9000).
$ErrorActionPreference = "Stop"
& "$PSScriptRoot\init-postgres.ps1"
& "$PSScriptRoot\start-s3.ps1"
