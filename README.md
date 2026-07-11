# Cổng Nhập Phiếu – Hồng Hà Văn Hành

Ứng dụng web nhập phiếu xuất hàng, lưu dữ liệu vào Supabase, export Excel.

---

## Công nghệ

| Layer     | Công nghệ                                    |
|-----------|----------------------------------------------|
| Frontend  | Next.js 14 (App Router) + TailwindCSS        |
| Backend   | Next.js API Routes (Serverless)              |
| Database  | Supabase (PostgreSQL free tier)              |
| Export    | SheetJS (xlsx)                               |
| Hosting   | Vercel (free tier)                           |

---

## Cài đặt local (lần đầu)

### 1. Cài Node.js
Tải từ https://nodejs.org (phiên bản LTS, ≥ 18)

### 2. Cài dependencies
```bash
cd cong-nhap-phieu
npm install
```

### 3. Tạo database trên Supabase
1. Vào https://supabase.com → tạo project mới (miễn phí)
2. Vào **SQL Editor** → paste toàn bộ nội dung file `supabase-schema.sql` → Run
3. Vào **Project Settings → API** → copy:
   - `Project URL`
   - `anon public` key
   - `service_role` key (secret, chỉ dùng server-side)

### 4. Tạo file `.env.local`
```bash
cp .env.example .env.local
```
Mở `.env.local` và điền đúng 3 giá trị từ bước trên:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_KEY=eyJh...
```

### 5. Chạy local
```bash
npm run dev
```
Mở http://localhost:3000

---

## Deploy lên Vercel (chia sẻ cho nhiều người dùng)

### Bước 1 – Đưa code lên GitHub
1. Tạo repo mới trên https://github.com (miễn phí)
2. Trong thư mục project, chạy:
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### Bước 2 – Deploy lên Vercel
1. Vào https://vercel.com → đăng nhập bằng GitHub
2. **New Project** → chọn repo vừa tạo
3. Vercel tự nhận Next.js, bấm **Deploy**

### Bước 3 – Thêm biến môi trường trên Vercel
Trong project Vercel → **Settings → Environment Variables**, thêm 3 biến:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
```
Sau đó **Redeploy** một lần → xong!

### Kết quả
- Vercel cấp domain dạng: `https://cong-nhap-phieu-xxx.vercel.app`
- Chia sẻ link này cho toàn bộ nhóm, ai cũng dùng được

---

## Cập nhật sản phẩm / kho mặc định

Chỉnh sửa trực tiếp trong file `supabase-schema.sql` phần `INSERT INTO san_pham` và `INSERT INTO kho`,
hoặc vào **Supabase Dashboard → Table Editor** để thêm/sửa/xóa.

---

## Cấu trúc thư mục

```
cong-nhap-phieu/
├── app/
│   ├── api/
│   │   ├── phieu/route.js          ← Lưu + đọc phiếu
│   │   ├── khach-hang/route.js     ← Quản lý khách hàng
│   │   ├── san-pham/route.js       ← Quản lý sản phẩm
│   │   └── kho/route.js            ← Quản lý kho
│   ├── layout.js                   ← Layout chung
│   ├── page.js                     ← Trang chính
│   └── globals.css                 ← CSS global
├── components/
│   └── PhieuForm.jsx               ← Form nhập phiếu (toàn bộ UI)
├── lib/
│   └── supabase.js                 ← Kết nối database
├── supabase-schema.sql             ← Schema database (chạy 1 lần)
├── .env.example                    ← Mẫu biến môi trường
└── README.md
```

---

## Import danh sách khách hàng từ Excel

File Excel cần có các cột (tên cột không phân biệt hoa thường):

| Mã KH   | Tên KH           | Địa chỉ            |
|---------|------------------|--------------------|
| KH-001  | Công ty ABC      | 123 Nguyễn Trãi    |
| KH-002  | Cửa hàng XYZ     | 456 Lê Lợi         |

Bấm nút **📤 Import Excel KH** trong form để upload file.
