# Start Mailpit (SMTP 1025, web UI 8025).
. "$PSScriptRoot\common.ps1"
Initialize-DevDirs
$exe = Join-Path $BinDir "mailpit.exe"
if (-not (Test-Path $exe)) { throw "mailpit.exe missing. Run scripts\dev\download-binaries.ps1" }
if (Test-PortListening $MailpitSmtpPort) { Write-Host "Port $MailpitSmtpPort already in use, Mailpit may already be running."; return }

$serverArgs = @("--smtp", "127.0.0.1:$MailpitSmtpPort", "--listen", "127.0.0.1:$MailpitUiPort")
$proc = Start-Process -FilePath $exe -ArgumentList $serverArgs `
    -RedirectStandardOutput (Join-Path $LogDir "mailpit.out.log") `
    -RedirectStandardError (Join-Path $LogDir "mailpit.err.log") `
    -WindowStyle Hidden -PassThru
Save-ProcessId "mailpit" $proc.Id
Write-Host "Mailpit started (pid $($proc.Id)): SMTP 127.0.0.1:$MailpitSmtpPort, UI http://127.0.0.1:$MailpitUiPort"
