# Hướng dẫn đồng bộ Google Sheet tự động

Apps Script này được gắn trực tiếp vào file Sheet kế toán để phát hiện thay đổi
và gọi Supabase gần như theo thời gian thực. Cần cả trigger `onEdit` lẫn trigger
theo thời gian vì `onEdit` không chạy khi `QUERY`, `IMPORTRANGE` hoặc công thức
tự tính lại mà không có người sửa ô.

Sau khi cài một lần, kế toán chỉ cần sửa Sheet như bình thường. Google Sheets tự
lưu nên không cần nhấn `Ctrl+S`, không cần bấm duyệt và cũng không cần mở Admin.
Backend tự kiểm tra snapshot, loại riêng dòng lỗi, tạo release bất biến và phát
tới TV cùng trang share.

## Cài đặt một lần

1. Mở file Sheet kế toán, chọn **Tiện ích mở rộng → Apps Script**.
2. Xóa mã cũ trong `Code.gs`, rồi dán toàn bộ nội dung file `Code.gs` trong thư
   mục này. Trong **Cài đặt dự án**, bật hiển thị tệp kê khai và thay nội dung
   bằng file `appsscript.json`.
3. Tại **Cài đặt dự án → Thuộc tính tập lệnh**, thêm đúng các thuộc tính:

   - `SYNC_ENDPOINT` =
     `https://hmlnrrgzrrrambxsauec.supabase.co/functions/v1/sync-sheet`
   - `SYNC_SHARED_SECRET` = secret 64 ký tự đang nằm trong clipboard sau khi
     quản trị viên xoay secret. Chỉ dán giá trị, không thêm dấu nháy.
   - `SPREADSHEET_ID` =
     `1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM`
   - `POLL_MINUTES` = `5`.
   - `STABLE_SECONDS` = `60`.
   - Có thể bỏ trống `SOURCE_ID`.
   - Không bắt buộc `WATCH_RANGES_JSON`; mặc định đã theo dõi
     `DS-KV!B1:N20` và `DS-TEAM!B1:S1000`.

4. Chọn hàm `installVinhDanhSync`, nhấn **Chạy** một lần và cấp quyền. Tải lại
   Sheet, menu **UNITE Vinh Danh** sẽ xuất hiện.
5. Chọn **UNITE Vinh Danh → Kiểm tra thay đổi ngay**. Kết quả tốt phải báo HTTP
   `200` và nêu rõ phiên bản `AUTO-...` đang được dùng hoặc vừa được phát.

## Cách hoạt động

- Khi người dùng sửa trực tiếp, script chỉ đánh dấu có thay đổi và đợi dữ liệu
  ổn định 60 giây trước khi gửi.
- Khi dữ liệu thay đổi do công thức, trigger 5 phút sẽ phát hiện. Vì vậy thay
  đổi trực tiếp thường lên trong khoảng 1–2 phút; thay đổi chỉ do công thức
  thường lên trong khoảng 5–6 phút.
- Backend luôn đọc lại Sheet gốc; không tin dữ liệu được gửi từ trình duyệt.
- Cột cố định được dùng làm nguồn quyết định:
  - `DS-KV`: cột L là doanh số QLCN, cột N là `Bảng Đấu`.
  - `DS-TEAM`: cột N xác định kỳ, cột O là `GDTC XÉT BEST TEAM`, cột S là
    `Bảng Đấu` Leader.
- Dòng thiếu tên, mã, khu vực, `Bảng Đấu`, hoặc doanh số không lớn hơn 0 bị loại
  riêng. Dòng hợp lệ còn lại vẫn được xếp hạng và phát tự động.
- Mỗi dòng QLCN/khu vực được xếp độc lập. Cùng một MNV có thể xuất hiện hai lần
  nếu hai khu vực đều hợp lệ và đều lọt hạng.
- Release mới giữ nguyên thứ tự, thời lượng, nền, logo, video và thông báo của
  bản đang chạy; chỉ phần dữ liệu vinh danh được thay từ Sheet.
- Nếu sai cấu trúc Sheet, mâu thuẫn kỳ, không còn kết quả an toàn, hoặc Supabase
  gặp lỗi, giao dịch phát mới bị hủy và bản tốt gần nhất vẫn tiếp tục chạy.
- Gửi lại cùng dữ liệu không tạo release trùng; hệ thống dùng lại đúng bản đã
  phát.

## Bảo mật secret

Giữ `SYNC_SHARED_SECRET` trong **Thuộc tính tập lệnh**. Không dán secret vào
`Code.gs`, source web, GitHub, APK, ảnh chụp màn hình hoặc tin nhắn hỗ trợ. Nếu
secret từng xuất hiện trong ảnh, phải xoay secret ngay và cập nhật lại thuộc tính
này.
