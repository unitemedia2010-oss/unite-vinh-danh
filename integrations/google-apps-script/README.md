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

4. Trong Apps Script Editor, chỉ cần chọn hàm `installVinhDanhSync`, nhấn
   **Chạy** một lần và cấp quyền. Sau đó quay lại tab Google Sheet và tải lại
   trang; menu **UNITE Vinh Danh** sẽ xuất hiện.
5. Ngay trong Google Sheet, chọn **UNITE Vinh Danh → Kiểm tra thay đổi ngay**.
   Sau khi kiểm tra, Sheet luôn mở hộp **Trạng thái đồng bộ**. Lần đầu có thể
   báo **ĐANG CHỜ DỮ LIỆU ỔN ĐỊNH**; sau tối thiểu 60 giây trigger sẽ tự gửi.
   Khi đã gửi thành công, hộp trạng thái báo HTTP `200` và nêu rõ phiên bản
   `AUTO-...` đang được dùng hoặc vừa được phát.

> **Quan trọng:** Không bấm Run hàm `showVinhDanhSyncStatus`/`showSyncStatus`
> trong Apps Script Editor để chờ một popup trong Editor. Editor chỉ hiện
> “Đang chạy tập lệnh” rồi “Đã kết thúc”. Hộp thoại thuộc Google Sheet, vì vậy
> hãy quay lại Sheet và chọn **UNITE Vinh Danh → Xem trạng thái**. Nếu vẫn chạy
> từ Editor, script sẽ gửi toast nếu nhận diện được tab Sheet đang mở và luôn
> ghi đầy đủ nội dung trong **Nhật ký thực thi**.

## Không cần URL triển khai Web app

Script này được gắn trực tiếp vào file kế toán và chạy bằng menu cùng trigger,
không có `doGet`/`doPost`, nên **không cần triển khai Apps Script thành Web
app**. URL dạng `https://script.google.com/macros/s/.../exec` không được dùng
trong cấu hình đồng bộ.

`SYNC_ENDPOINT` phải luôn là URL Supabase sau:

```text
https://hmlnrrgzrrrambxsauec.supabase.co/functions/v1/sync-sheet
```

Không thay URL này bằng URL Web app Apps Script.

## Xem trạng thái

Trong Google Sheet, chọn **UNITE Vinh Danh → Xem trạng thái**. Hộp trạng thái
hiển thị:

- trigger đã cài hay chưa;
- dữ liệu đang chờ ổn định hay đã đồng bộ;
- lần gần nhất thấy dữ liệu và gửi Supabase;
- HTTP gần nhất, phiên bản phát và lỗi gần nhất.

Nếu menu chưa xuất hiện, tải lại trang Google Sheet. Không cần bấm **Triển
khai** trong Apps Script.

## Cách hoạt động

- Khi người dùng sửa trực tiếp, script chỉ đánh dấu có thay đổi và đợi dữ liệu
  ổn định 60 giây trước khi gửi.
- Khi dữ liệu thay đổi do công thức, trigger 5 phút sẽ phát hiện. Vì vậy thay
  đổi trực tiếp thường lên trong khoảng 1–2 phút; thay đổi chỉ do công thức
  thường lên trong khoảng 5–6 phút.
- Backend luôn đọc lại Sheet gốc; không tin dữ liệu được gửi từ trình duyệt.
- Cột dùng xếp hạng do Admin chọn trong trang **Đồng bộ Google Sheet**:
  - Chế độ đầu tháng: `DS-KV` cột K và `DS-TEAM` cột M (`TỔNG CỌC`).
  - Chế độ chốt: `DS-KV` cột L và `DS-TEAM` cột O (`GDTC`).
  - `DS-KV` cột N và `DS-TEAM` cột S vẫn luôn là `Bảng Đấu`; Admin không thay
    hai cột này bằng giao diện chọn doanh số.
  - `DS-TEAM` cột N vẫn xác định kỳ dữ liệu khi cột O không chứa tên tháng.
- Apps Script chỉ kích hoạt đồng bộ và không có quyền đổi lựa chọn cột. Sau khi
  Admin lưu, mọi lần đồng bộ tự động kế tiếp sẽ đọc cấu hình mới từ Supabase.
- Không cần đổi tên sheet hoặc sửa tay tiêu đề cột mỗi tháng. Giữ nguyên hai tab
  `DS-KV` và `DS-TEAM`; khi tiêu đề kỳ tự chuyển từ `T8` sang `T9`, hệ thống vẫn
  đọc đúng các vị trí K/L/M/N/O/S đã chọn và tự đổi kỳ phát hành từ tháng 8
  sang tháng 9.
  Nội dung tiêu đề chỉ dùng để nhận biết tháng và cảnh báo, không được phép kéo
  thuật toán sang một cột khác có tên giống nhau.
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
