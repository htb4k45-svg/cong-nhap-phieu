# Hướng dẫn Deploy lên Vercel

## Bước 1 — Commit & Push lên GitHub

Mở PowerShell, chạy từng lệnh:

```powershell
cd "E:\Viet\HH Van Hanh\cong-nhap-phieu"

# Xóa lock file nếu có
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue

# Stage tất cả file mới
git add -A

# Commit
git commit -m "feat: Google Sheets realtime + trang dieu-xe"

# Push lên GitHub
git push origin main
```

---

## Bước 2 — Tạo project trên Vercel

1. Vào **https://vercel.com** → đăng nhập (dùng GitHub account)
2. Nhấn **"Add New → Project"**
3. Chọn repo **`cong-nhap-phieu`** từ GitHub → nhấn **Import**
4. Framework: chọn **Next.js** (tự detect)
5. Root Directory: để trống (hoặc `cong-nhap-phieu` nếu có subfolder)

---

## Bước 3 — Cấu hình Environment Variables

Trong trang cấu hình Vercel (trước khi Deploy), mở phần **Environment Variables** và thêm 3 biến:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | *(copy từ .env.local)* |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | *(copy từ .env.local)* |
| `SUPABASE_SECRET_KEY` | *(copy từ .env.local)* |

> Mở file `.env.local` trong thư mục `cong-nhap-phieu` để copy giá trị

---

## Bước 4 — Deploy

Nhấn **"Deploy"** → chờ ~2 phút → Vercel sẽ cho URL kiểu:  
`https://cong-nhap-phieu-xxxx.vercel.app`

---

## Bước 5 — Chạy SQL migration trên Supabase (nếu chưa)

Để tính năng theo dõi trạng thái giao hoạt động:

1. Vào **https://supabase.com** → project → **SQL Editor**
2. Mở file `supabase-migration-dispatch-status.sql` trong thư mục dự án
3. Copy toàn bộ nội dung → paste vào SQL Editor → nhấn **Run**

---

## Sau khi deploy

- Mỗi lần sửa code → `git add -A && git commit -m "..." && git push` → Vercel tự deploy lại
- URL production sẽ là domain cố định (không đổi mỗi lần deploy)
