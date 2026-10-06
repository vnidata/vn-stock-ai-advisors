"""
AlphaQuant AI - Autonomous Real-time Market Scheduler
Tự động kích hoạt pipeline cập nhật dữ liệu thị trường và chạy suy luận AI Advisor
định kỳ 6 lần mỗi ngày giao dịch theo giờ Việt Nam (UTC+7):
  1. 09:00 - Mở phiên ATO & Khởi động sáng
  2. 10:00 - Giữa phiên sáng, dòng tiền ổn định
  3. 11:30 - Chốt phiên sáng, đánh giá xu hướng trưa
  4. 13:30 - Mở phiên chiều, hấp thụ lượng hàng T+2.5 về
  5. 14:00 - Giờ cao điểm phiên chiều, rung lắc mạnh
  6. 15:00 - Đóng phiên ATC & Tổng kết ngày
"""

import os
import sys
import time
import subprocess
from datetime import datetime, time as dtime
import pytz

# Force UTF-8 encoding on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

VN_TZ = pytz.timezone('Asia/Ho_Chi_Minh')

SCHEDULED_SLOTS = [
    dtime(9, 0),
    dtime(10, 0),
    dtime(11, 30),
    dtime(13, 30),
    dtime(14, 0),
    dtime(15, 0)
]

def run_pipeline():
    now_vn = datetime.now(VN_TZ)
    print(f"\n=======================================================")
    print(f"[SCHEDULER] Kích hoạt phiên quét lúc: {now_vn.strftime('%Y-%m-%d %H:%M:%S')} (Giờ VN)")
    print(f"=======================================================")
    
    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "daily_update.py")
    try:
        res = subprocess.run([sys.executable, script_path], check=True, text=True)
        print(f"[SCHEDULER] Hoàn tất cập nhật thành công (Exit Code: {res.returncode})")
    except subprocess.CalledProcessError as e:
        print(f"[SCHEDULER] Lỗi khi thực thi pipeline: {e}", file=sys.stderr)

def get_next_run_info():
    now_vn = datetime.now(VN_TZ)
    now_time = now_vn.time()
    
    # Check remaining slots today if weekday (0=Mon, 4=Fri)
    if now_vn.weekday() < 5:
        for slot in SCHEDULED_SLOTS:
            if now_time < slot:
                return f"Hôm nay lúc {slot.strftime('%H:%M')} (còn khoảng {int((datetime.combine(now_vn.date(), slot, tzinfo=VN_TZ) - now_vn).total_seconds() / 60)} phút)"
    
    # Otherwise next Monday or tomorrow 09:00
    return "09:00 phiên giao dịch kế tiếp"

def main():
    print("=" * 65)
    print("  ALPHAQUANT AI - BỘ ĐIỀU PHỐI CẬP NHẬT TỰ ĐỘNG 6 PHIÊN/NGÀY")
    print("  Lịch quét cố định: 09:00 | 10:00 | 11:30 | 13:30 | 14:00 | 15:00 (UTC+7)")
    print("=" * 65)
    print(f"Thời gian hiện tại: {datetime.now(VN_TZ).strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Phiên quét kế tiếp: {get_next_run_info()}\n")
    print("Đang lắng nghe... Nhấn Ctrl+C để dừng.")

    executed_slots_today = set()
    current_date = datetime.now(VN_TZ).date()

    while True:
        try:
            now_vn = datetime.now(VN_TZ)
            today = now_vn.date()
            if today != current_date:
                current_date = today
                executed_slots_today.clear()

            # Only run on trading days (Monday to Friday)
            if now_vn.weekday() < 5:
                now_minute = now_vn.strftime("%H:%M")
                for slot in SCHEDULED_SLOTS:
                    slot_str = slot.strftime("%H:%M")
                    if now_minute == slot_str and slot_str not in executed_slots_today:
                        executed_slots_today.add(slot_str)
                        run_pipeline()
                        print(f"\n[SCHEDULER] Phiên kế tiếp: {get_next_run_info()}")

            time.sleep(20) # Check every 20 seconds
        except KeyboardInterrupt:
            print("\n[SCHEDULER] Đã dừng bộ điều phối.")
            break
        except Exception as e:
            print(f"[SCHEDULER ERROR] {e}", file=sys.stderr)
            time.sleep(30)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--now":
        run_pipeline()
    else:
        main()
