# Unite Vinh Danh

Hệ thống quản trị nội dung và trình chiếu vinh danh cho TV tại các chi nhánh Unite Group.

## Thành phần

- `apps/web-control`: Web Admin và Web TV Player (React, TypeScript, Vite).
- `apps/tv-android`: ứng dụng Android TV.
- `supabase`: cơ sở dữ liệu, migration và Edge Functions đồng bộ Sheet/phát hành nội dung.
- `assets`: tài nguyên thương hiệu gốc.

## Chạy trên máy tính

```powershell
cd apps/web-control
npm install
npm run dev
```

Mở:

- Admin: `http://localhost:5173/#/admin/dashboard`
- TV trực tuyến từ bản phát hành thật: `http://localhost:5173/#/tv`
- TV ghép nối theo chi nhánh: `http://localhost:5173/#/screen?branch=br-01`

Hoặc chạy `Start-Unite-VinhDanh.ps1` từ thư mục gốc.

## Luồng dữ liệu

1. Apps Script kiểm tra thay đổi của Google Sheet theo lịch tự động.
2. Edge Function kiểm tra cấu trúc, lưu lô import và xếp đúng theo cột **Bảng Đấu**.
3. Khi dữ liệu ổn định, Supabase tự tạo bản phát hành mới có phiên bản.
4. Web/Android TV lấy manifest mới; link `/tv` kiểm tra cập nhật mỗi 60 giây.

Sheet là nguồn quyết định tên, khu vực/team, bảng đấu và doanh số. Nếu một dòng
thiếu hoặc lỗi, dòng đó bị loại khỏi bảng thay vì được thay bằng dữ liệu giả.

## Kiểm tra trước khi phát hành

```powershell
cd apps/web-control
npm ci
npm run check
```

Kiểm thử Supabase:

```powershell
npx -y deno-bin test --allow-env --allow-net supabase/functions/_shared
```

## GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` tự build và phát hành `apps/web-control` khi nhánh `main` được cập nhật. Ba Repository Variables cần có:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SOURCE_SHEET_ID`

Không commit `.env.local`, service-role key, mật khẩu database, keystore hoặc APK vào repository.
