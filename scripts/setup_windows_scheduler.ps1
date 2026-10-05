# Setup 6 Automated Scheduled Tasks on Windows for AlphaQuant AI
# Sessions: 09:00, 10:00, 11:30, 13:30, 14:00, 15:00 (Monday - Friday)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = Split-Path -Parent $scriptDir
$pythonExe = (Get-Command python).Source
$dailyUpdateScript = Join-Path $scriptDir "daily_update.py"

$slots = @(
    @{ Name = "AlphaQuant_Scan_0900"; Time = "09:00" },
    @{ Name = "AlphaQuant_Scan_1000"; Time = "10:00" },
    @{ Name = "AlphaQuant_Scan_1130"; Time = "11:30" },
    @{ Name = "AlphaQuant_Scan_1330"; Time = "13:30" },
    @{ Name = "AlphaQuant_Scan_1400"; Time = "14:00" },
    @{ Name = "AlphaQuant_Scan_1500"; Time = "15:00" }
)

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  ALPHAQUANT AI - CÀI ĐẶT WINDOWS TASK SCHEDULER (6 LẦN/NGÀY)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Python Path: $pythonExe"
Write-Host "Repo Path:   $repoDir"
Write-Host "Script:      $dailyUpdateScript"
Write-Host ""

foreach ($s in $slots) {
    $taskName = $s.Name
    $taskTime = $s.Time
    
    $action = New-ScheduledTaskAction -Execute $pythonExe -Argument "`"$dailyUpdateScript`"" -WorkingDirectory $repoDir
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $taskTime
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "AlphaQuant AI real-time scan session at $taskTime" -Force | Out-Null
    Write-Host "  [OK] Đã tạo Task: $taskName lúc $taskTime (T2-T6)" -ForegroundColor Green
}

Write-Host "`nĐã thiết lập thành công 6 tác vụ tự động trong Windows Task Scheduler!" -ForegroundColor Yellow
Write-Host "Hệ thống sẽ tự động chạy ngầm đúng các khung giờ giao dịch chứng khoán." -ForegroundColor Yellow
