# Stop everything started by dev-up.ps1.
. "$PSScriptRoot\common.ps1"
Stop-SavedProcess "s3"
& "$PSScriptRoot\stop-postgres.ps1"
