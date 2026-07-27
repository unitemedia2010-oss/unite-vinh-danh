# Unite Recognition Control · Web MVP

Frontend React/TypeScript tách biệt cho hệ thống điều phối vinh danh. Thư mục này không thay đổi ứng dụng poster cũ ở root.

## Chạy local

```powershell
npm install
npm run dev
```

Nếu PowerShell chặn `npm.ps1`, dùng lệnh tương đương:

```powershell
npm.cmd install
npm.cmd run dev
```

- Admin: `http://localhost:5173/#/admin/dashboard`
- TV Web Player: `http://localhost:5173/#/screen?branch=br-01`

Web Player có nút toàn màn hình, chuyển slide tự động, điều khiển âm thanh, video demo và báo trạng thái offline. Production build đăng ký service worker để cache app shell và các tài nguyên cùng origin.

Player có video mẫu nhẹ khi chưa cấu hình. Đặt `VITE_DEMO_VIDEO_URL` hoặc tải MP4 riêng trong Admin để thay video mẫu. Player dùng `autoPlay`, `playsInline` và trạng thái mute chung; nếu trình duyệt chặn autoplay có tiếng, màn hình hiện nút **Bắt đầu trình chiếu có âm thanh** để xác nhận một lần bằng thao tác người dùng.

## Trình thiết lập playlist

Vào **Nội dung & Playlist** để:

- Thêm, nhân bản, xóa, bật/tắt và kéo hoặc bấm lên/xuống để sắp xếp từng trang.
- Chỉnh tên mục, tiêu đề lớn, phụ đề, nội dung thông báo, ngày giờ và địa điểm sự kiện.
- Tải logo, ảnh nền và video riêng; chỉnh vị trí, kích thước logo, độ tối nền và cách phủ ảnh.
- Đặt thời lượng, hiệu ứng chuyển, lịch riêng, ngày trong tuần và chi nhánh áp dụng cho từng trang.
- Đặt lịch mặc định cho toàn playlist và xem tổng thời gian chính xác của một vòng.

Trong demo Web, cấu hình chữ được tự lưu bằng `localStorage`, còn logo/ảnh/video
được lưu dạng Blob trong `IndexedDB`. Hai tab Admin và TV trên **cùng trình
duyệt** cập nhật tức thì qua `BroadcastChannel` và vẫn giữ cấu hình sau khi tải
lại.

Khi đã cấu hình Supabase và đăng nhập Admin, nút **Lưu bản nháp** ghi playlist,
từng trang và media vào PostgreSQL/Storage; nút **Tải từ Cloud** nạp lại bản nháp
đó. Trang **Bản phát hành** thực hiện quy trình hai bước: tạo bản `READY`, sau đó
Admin xác nhận phát tới 9 TV. GitHub Pages chỉ là hosting tĩnh; đồng bộ nhiều thiết
bị vẫn đi qua Supabase.

## Kết nối Supabase

1. Sao chép `.env.example` thành `.env.local`.
2. Điền project URL và anon/publishable key. Không bao giờ đưa service-role key vào frontend.
3. Edge Functions mặc định là `sync-sheet`, `screen-api` và `publish-release`; có thể đổi tên qua các biến `VITE_*_FUNCTION`.
4. Vào **Cài đặt hệ thống → Supabase Backend** để đăng nhập tài khoản Admin.
5. `sync-sheet` dùng phiên đăng nhập đó, gửi user JWT trong `Authorization` cùng body `force`, `sourceId` (nếu cấu hình) và `spreadsheetId`.
6. Deploy ba Edge Functions `sync-sheet`, `screen-api`, `publish-release`.
7. Mở Web TV bằng route `/screen` không có `preview=1`; TV sẽ hiện mã 6 số. Duyệt mã ở **Thiết bị TV → Ghép nối TV**.

Sau khi Supabase CLI đã đăng nhập đúng tài khoản sở hữu OneDrop, có thể deploy
đúng ba function bằng:

```powershell
powershell -ExecutionPolicy Bypass -File ..\..\supabase\deploy-onedrop.ps1
```

Khi chưa có biến môi trường, UI chạy ở mock mode để duyệt nghiệp vụ và thiết kế mà không gọi backend thật.

## Build

```powershell
npm run build
npm run preview
```

`vite.config.ts` dùng base tương đối để build có thể đặt trên Netlify/Vercel hoặc một static host. Các route chính dùng hash nên không cần rewrite rule. `netlify.toml` và `vercel.json` đã chứa build/output cùng header phù hợp cho service worker.

## Chia sẻ bằng GitHub Pages

Repo đã có workflow `.github/workflows/deploy-pages.yml` để build đúng app trong
`apps/web-control` và chỉ đưa thư mục `dist` lên Pages. Không chọn **Deploy from a
branch / root**, vì root của repo còn chứa trang poster cũ.

1. Tạo repo GitHub và push toàn bộ thư mục dự án lên nhánh `main`.
2. Vào **Settings → Secrets and variables → Actions → Variables** rồi tạo ba
   Repository Variables công khai:
   - `VITE_SUPABASE_URL`: URL project Supabase dùng cho Vinh Danh.
   - `VITE_SUPABASE_ANON_KEY`: publishable/anon key dành cho client.
   - `VITE_SOURCE_SHEET_ID`: ID Google Sheet kế toán.
3. Vào **Settings → Pages → Build and deployment**.
4. Chọn **Source: GitHub Actions**.
5. Mở tab **Actions**, chạy workflow `Deploy Unite Recognition Demo` hoặc push
   một commit mới lên `main`.

Workflow chủ động dừng nếu thiếu một trong ba biến công khai trên để tránh vô tình
đưa bản `MOCK MODE` lên link chính thức. Vite nhúng các biến `VITE_*` vào JavaScript
phía trình duyệt, vì vậy publishable/anon key không phải secret và dữ liệu phải luôn
được bảo vệ bằng RLS. Không đưa service-role key, mật khẩu database, access token
CLI, `SYNC_SHARED_SECRET` hay tài khoản Admin vào source hoặc GitHub Actions.

App dùng hash route và `base: './'`, nên link project Pages hoạt động ở dạng:

```text
https://<github-user>.github.io/<repo>/#/admin/dashboard
https://<github-user>.github.io/<repo>/#/screen?branch=br-01
```

Không đổi sang `BrowserRouter` hoặc base `/`, vì hai cấu hình đó sẽ làm link con
trên GitHub Project Pages dễ trả về 404 hoặc tải sai asset.

Dữ liệu tháng 08 trong `src/data/mock.ts` được gắn nhãn **DEMO**. Hãy thay bằng
snapshot FINAL đã được phép công khai trước khi dùng link Pages như bảng chính thức.

## Phạm vi MVP hiện tại

- Dashboard 9 chi nhánh, có pilot `125 Trần Bình Trọng` và CN09 `683 Âu Cơ Tân Phú`.
- Google Sheet source, mapping, lịch sử import và cảnh báo dữ liệu.
- Các bảng QLCN/Leader/Sale FT/Sale PT/Team; Top 1–3 nổi bật và hạng 4–10 dạng danh sách.
- Ghi đè Admin trên bản phát hành, gồm mẫu `156.000.000 VNĐ`.
- Trình thiết lập playlist Web đầy đủ cho vinh danh/video/thông báo/sự kiện, có tự lưu cục bộ và lưu/tải Cloud.
- Device health, release readiness, lịch sử và rollback UI.
- Đăng nhập Supabase Auth và duyệt mã ghép nối TV thật từ trang Thiết bị.
- Tạo `READY` và phát release từ Admin; Web/Android TV nhận manifest, signed URL và gửi heartbeat.
- Web TV Player 16:9 dùng để kiểm tra nhanh trước khi cài Android TV APK.

Dữ liệu bảng, device health và release trong `src/data/mock.ts` là dữ liệu minh họa,
không phải kết quả chính thức từ Sheet. Chỉ phát dữ liệu thật sau khi import batch
được duyệt và tài khoản có vai trò `super_admin`, `admin` hoặc `publisher`.
