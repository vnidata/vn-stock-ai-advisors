# KIẾN TRÚC KẾT NỐI DỮ LIỆU THỜI GIAN THỰC (REAL-TIME STREAMING BLUEPRINT)

Tài liệu này được trích xuất từ báo cáo nghiên cứu kỹ thuật [`reports/realtime_streaming_research.md`](file:///E:/OneDrive%20-%20BIDV%20Securities%20JSC/AI_data_skill/vn-stock-ai-advisors/reports/realtime_streaming_research.md).

## 1. Mục Tiêu & Cơ Chế
Hệ thống BullChill AI hỗ trợ cơ chế nạp dữ liệu khớp lệnh thời gian thực thông qua:
1. **WebSocket Stream (WSS)**: Kết nối tới cổng truyền tải dữ liệu của CTCK (SSI FastConnect API, VPS Socket.IO, VNDIRECT DStock, DNSE Open API).
2. **Adaptive Polling Fallback**: Tự động nhận diện giờ giao dịch (09:00 - 11:30 & 13:00 - 14:45 ICT) để làm mới dữ liệu và xếp hạng cổ phiếu mạnh liên tục.
3. **Bộ tính toán trực tuyến (On-the-fly Quant Engine)**:
   - Tính toán Relative Strength Rating (RS Rating 1-99)
   - Khối lượng dòng tiền đột biến (Volume Ratio vs MA20)
   - Kênh giá Donchian Breakout 55 phiên (Turtle System 2)

## 2. Thử Nghiệm Module Trực Tuyến
Chạy module kiểm thử kết nối trực tuyến bằng lệnh:
```bash
python data/realtime_stream_client.py --test
```
Module sẽ kết nối, mô phỏng/thu thập tick khớp lệnh, chuẩn hóa dữ liệu và tính toán chỉ báo định lượng tự động.
