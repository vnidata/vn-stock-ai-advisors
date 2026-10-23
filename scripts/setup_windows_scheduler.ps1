# Setup Automated Scheduled Tasks on Windows for AlphaQuant AI
# Auto-update every 5 minutes during trading hours (09:00 - 15:00, Monday - Friday)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = Split-Path -Parent $scriptDir
$pythonExe = (Get-Command python).Source
$dailyUpdateScript = Join-Path $scriptDir "daily_update.py"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  ALPHAQUANT AI - CÀI ĐẶT WINDOWS TASK SCHEDULER (MỖI 5 PHÚT)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Python Path: $pythonExe"
Write-Host "Repo Path:   $repoDir"
Write-Host "Script:      $dailyUpdateScript"
Write-Host ""

$taskName = "AlphaQuant_AutoScan_5Min"
$action = New-ScheduledTaskAction -Execute $pythonExe -Argument "`"$dailyUpdateScript`"" -WorkingDirectory $repoDir
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 09:00 -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 6)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "AlphaQuant AI real-time scan session every 5 minutes (09:00 - 15:00)" -Force | Out-Null
Write-Host "  [OK] Đã tạo Task: $taskName lặp lại mỗi 5 phút từ 09:00 đến 15:00 (T2-T6)" -ForegroundColor Green

Write-Host "`nĐã thiết lập thành công tác vụ tự động trong Windows Task Scheduler!" -ForegroundColor Yellow
Write-Host "Hệ thống sẽ tự động chạy ngầm mỗi 5 phút đúng khung giờ giao dịch chứng khoán." -ForegroundColor Yellow
