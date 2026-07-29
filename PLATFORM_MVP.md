# UNITE Vinh Danh — nền tảng điều phối TV

Repo hiện có ba phần độc lập, không phá ứng dụng poster cũ ở thư mục gốc:

- `apps/web-control`: React + TypeScript + Vite, gồm Admin và Web TV Player.
- `apps/tv-android`: Android TV player native Kotlin và APK debug.
- `supabase`: PostgreSQL migration và Edge Functions cho Sheet, thiết bị và phát hành.

## Luồng vận hành mục tiêu

```text
Google Sheet kế toán
  -> sync-sheet tạo snapshot có version/hash
  -> Admin kiểm tra cảnh báo, ảnh, thứ hạng và ghi đè
  -> tạo release bất biến + playlist
  -> publish-release gán release cho các màn hình và gửi Broadcast
  -> Android/Web Player tải manifest, cache media, chuyển đúng thời điểm
  -> heartbeat cập nhật online/offline, release và lỗi phát
```

TV không đọc trực tiếp bảng dữ liệu hoặc Storage. `screen-api` chỉ trả manifest của đúng
màn hình đã ghép nối và tạo signed URL ngắn hạn cho media riêng tư.

## Trạng thái Sheet đã kiểm tra ngày 15/07/2026

Workbook `1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM` hiện chỉ có:

- `DS-KV`: dữ liệu khu vực/QLCN.
- `DS-TEAM`: dữ liệu team và leader.

Không có tab Sale Full-time, Sale Part-time, ảnh nhân sự, rank vinh danh hoặc ô `FINAL`.
Hai tab cũng chưa chia sẵn các tier. `sync-sheet` tự tạo kết quả QLCN và Top 10 Team từ
cùng cột `DS-TEAM.GDTC XÉT BEST TEAM`; các nhóm Leader/Sale còn thiếu dữ liệu vẫn làm
batch ở trạng thái `needs_review` và không được tự công bố.

Google Visualization gộp dòng tiêu đề với header `STT`; parser đã có logic nhận dạng dạng
này, chỉ nhận dòng có STT số, bỏ tổng/đối soát/lỗi công thức và giữ số dòng Sheet gốc.

### Tab output đề nghị cho kế toán

Tên tab: `VINH_DANH_OUTPUT`

```text
period | status | category | tier | rank | subject_type | subject_code
subject_name | employee_code | branch_code | team_code | revenue_vnd
photo_key | note | enabled
```

`category`: `QLCN`, `LEADER`, `SALE_FT`, `SALE_PT`, `TEAM`.

`status`: `DRAFT` hoặc `FINAL`. Kế toán vẫn có thể sửa sau FINAL; lần đồng bộ kế tiếp tạo
batch/release mới, không ghi đè bản đã phát. Admin override nằm ở lớp riêng và không sửa Sheet.

## Quy tắc đã cấu hình

- QLCN: xếp từng dòng khu vực trong `DS-KV` bằng cột K (`TỔNG CỌC Tn`) hoặc
  cột L (`TỔNG GDTC+HC Tn`) do Admin chọn. Cùng một MNV phụ trách hai khu vực
  vẫn là hai ứng viên độc lập và có thể xuất hiện hai hạng.
- Hạng QLCN: Thủ Lĩnh 0–299 triệu, Đại Tướng 300–499 triệu, Thống Soái từ 500 triệu;
  tối đa Top 3 mỗi bảng.
- Team: xếp Top 10 bằng cột M (`TỔNG CỌC Tn`) hoặc cột O
  (`GDTC XÉT BEST TEAM`) do Admin chọn. Một team được
  định danh bằng cặp (`KHU VỰC`, `TEAM`), vì cùng mã team ở hai khu vực là hai đối tượng
  khác nhau. Chỉ dòng có `KHU VỰC` và `TEAM` hợp lệ mới được tự động xếp hạng; Top 1–3
  hiển thị nổi bật và hạng 4–10 hiển thị dạng danh sách.
- Leader: Sư Tử 50–99 triệu, Phượng Hoàng 100–199 triệu, Kỳ Lân từ 200 triệu.
- Sale FT và Sale PT: Top 1–3 nổi bật, hạng 4–10 dạng danh sách sau khi chốt nguồn dữ liệu.
- Tiền lưu dạng số nguyên; UI render `156000000` thành `156.000.000 VNĐ`.
- Video bật âm thanh, media cache cục bộ; bảng ảnh có hiệu ứng vào/ra.

### Đối soát QLCN và Top Team từ Sheet live ngày 15/07/2026

- Đại Tướng: hạng 1 Trương Quang Nhất (`U708`, CTC) `310.822.637 VNĐ`; hạng 2
  Nguyễn Duy Linh (`U558`, ATC) `301.633.325 VNĐ`.
- Thủ Lĩnh: hạng 1 Nguyễn Thị Hà (`U177`, DOC1 + DFC) `298.783.478 VNĐ`; hạng 2
  Trương Thị Tường Vi (`U32`, BTC1) `177.165.888 VNĐ`; hạng 3 Đinh Phương
  Thanh Yến (`U316`, TBC) `163.968.589 VNĐ`.
- Thống Soái: chưa có người đạt từ `500.000.000 VNĐ`.
- Top Team: hạng 1 MONEY — Trần Xuân Hoa (`U966`, TBC) `119.530.778 VNĐ`; hạng 2
  FUSION — Phạm Vũ Thư (`U382`, DOC1) `94.334.593 VNĐ`; hạng 3 ZENITH — Nguyễn
  Thị Cẩm Giang (`U553`, CTC) `87.308.667 VNĐ`.
- Có 43 cặp (`KHU VỰC`, `TEAM`) hợp lệ để xếp Top Team, tổng `1.627.124.507 VNĐ`.
  Năm dòng PKD, HT, PVH, PNS, PMKT có tổng `82.330.881 VNĐ` bị loại khỏi xếp hạng
  tự động vì trống `KHU VỰC`; hệ thống tạo cảnh báo để Admin kiểm tra thay vì tự gán.
- Tổng `GDTC XÉT BEST TEAM`: `1.709.455.388 VNĐ`; đã ánh xạ cho 9 QLCN:
  `1.611.287.007 VNĐ`; chưa gán: `98.168.381 VNĐ`.
- Phần chưa gán cho QLCN gồm khu vực TP `15.837.500 VNĐ` chưa có QLCN/MNV và năm
  dòng trống `KHU VỰC` nêu trên. Batch phải ở `needs_review` cho đến khi Admin xác nhận
  cách xử lý; dữ liệu cảnh báo không được tự cộng sang QLCN hoặc team khác.

## Chạy Web local

```powershell
cd apps\web-control
Copy-Item .env.example .env.local
npm install
npm run dev
```

- Admin: `http://localhost:5173/#/admin/dashboard`
- Web TV: `http://localhost:5173/#/screen?branch=TBT125`

Nếu chưa điền Supabase URL/publishable key, app chạy mock mode để duyệt giao diện. Cấu hình
Netlify và Vercel đã nằm trong thư mục app.

## Tạo Supabase riêng

1. Tạo project Supabase mới hoặc dùng chung project OneDrop đã được sao lưu.
2. Chạy `supabase/migrations/202607150001_vinhdanh_platform.sql` trực tiếp. Migration dùng
   `vinhdanh_profiles` riêng và không cần chạy `01_schema.sql` poster cũ.
3. Cấu hình secrets theo `supabase/functions/.env.example`; không đưa secret/service-role key
   vào web hoặc APK.
4. Deploy `sync-sheet`, `screen-api`, `publish-release` với JWT gateway tắt; từng function tự
   xác thực Admin JWT, schedule secret hoặc device token theo đúng action.
5. Tạo user Auth và profile vai trò `super_admin`/`admin`.

`publish-release` chỉ nhận release ở trạng thái `ready`. Nếu release gắn với dữ liệu Sheet,
`import_batch` tương ứng phải ở trạng thái `validated`; batch còn `needs_review` không thể
được phát lên TV.

Migration đã tạo sẵn pilot `125 Trần Bình Trọng`, chi nhánh `683 Âu Cơ, Tân Phú`, cùng một
screen TV chính cho mỗi địa điểm. Bảy chi nhánh còn lại cần bổ sung mã/tên/địa chỉ chính thức.

## Ghép nối TV

1. TV gọi `screen-api` với action `register`, nhận mã 6 số và device token.
2. Admin chọn screen và duyệt mã bằng action `approve`.
3. TV kiểm tra action `status`; khi approved, tải action `manifest`.
4. TV gửi action `heartbeat` định kỳ. Token chỉ lưu mã hóa trong Android Keystore.

## Cài APK pilot

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r `
  apps\tv-android\app\build\outputs\apk\debug\app-debug.apk
```

APK debug dùng cho pilot nội bộ. Bản phát hành rộng cần keystore ký release, versioning,
Realtime websocket hoàn chỉnh, kiểm thử mất mạng/khởi động lại và xác nhận codec trên TV thật.

## Xác nhận dữ liệu còn thiếu

1. Leader dùng cột nào; `GDTC TÍNH TN` hiện thiếu số ở nhiều dòng.
2. Sale FT/PT nằm ở workbook/tab nào.

Các nhóm nghiệp vụ chưa chốt nguồn hiện chỉ còn Leader, Sale FT và Sale PT. Việc kế toán
có thêm `VINH_DANH_OUTPUT` hay không là quyết định vận hành riêng, không chặn công thức
Top Team và QLCN đã xác nhận ở trên.
