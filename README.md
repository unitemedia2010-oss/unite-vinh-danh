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
- TV thử nghiệm: `http://localhost:5173/#/screen?branch=br-01&preview=1`

Hoặc chạy `Start-Unite-VinhDanh.ps1` từ thư mục gốc.

## Luồng dữ liệu

1. Admin bấm đồng bộ để Edge Function đọc snapshot mới nhất từ Google Sheet.
2. Supabase lưu lô import, cảnh báo và kết quả theo từng bảng đấu.
3. Admin kiểm tra, duyệt lô và tạo bản phát hành có phiên bản.
4. Sau khi Admin bấm phát hành, Web/Android TV nhận manifest mới qua Supabase.

Sheet không được đẩy thẳng lên TV ngay sau mỗi lần sửa. Bước duyệt và phát hành được giữ lại để tránh dữ liệu đang nhập dở xuất hiện trên 9 màn hình.

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
