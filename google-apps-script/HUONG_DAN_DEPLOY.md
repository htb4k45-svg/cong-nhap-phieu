# Hướng dẫn deploy Google Apps Script — Write-back Lái xe / Phụ xe

## Tổng quan

Khi điều phối viên phân xe trong app, hệ thống tự động ghi **Lái xe** và **Phụ xe** ngược lại vào cột tương ứng trong Google Sheets.

```
App (điều xe) → POST /api/dispatch-status → Supabase DB
                                           ↓ (fire-and-forget)
                                    APPS_SCRIPT_WRITE_URL
                                           ↓
                              Google Sheets (cập nhật cột Lái xe / Giao nhận)
```

---

## Bước 1 — Tạo Google Apps Script

Script này truy cập **cả hai file** (MT và B2B) thông qua `SpreadsheetApp.openById(id)`,
nên chỉ cần deploy **1 script duy nhất** — không cần mở từng sheet.

**Cách khuyến nghị — Standalone script (không gắn vào sheet nào):**

1. Vào **[script.google.com](https://script.google.com)** → Bấm **New project**
2. Đổi tên project (góc trên trái) thành `HongHa-WriteBack`
3. Xóa code mặc định trong editor

*(Nếu muốn gắn vào sheet: mở bất kỳ sheet nào → Extensions → Apps Script — đều được, vì script dùng openById không phụ thuộc sheet hiện tại)*

---

## Bước 2 — Paste code

Copy toàn bộ nội dung file `sheets_writeback.gs` và paste vào editor.

Kiểm tra các Sheet ID ở đầu file:
```javascript
var SHEET_CONFIG = {
  MT:  { id: '1Qqbnewj_vb2k8mH3MghkTLzyoLUlsrm7BF1HEpW1nmQ' },
  GT:  { id: '1Qqbnewj_vb2k8mH3MghkTLzyoLUlsrm7BF1HEpW1nmQ' },
  B2B: { id: '1cpSsk_kUbJ3Yy_g-UVNyvWrv0sHtdKRdxunpPwNstV4' },
};
```

---

## Bước 3 — Test trước khi deploy

1. Đổi `so_phieu` trong hàm `testWriteBack()` thành 1 số phiếu có thật trong sheet
2. Bấm **Run → testWriteBack**
3. Xem kết quả trong **Execution log** (Ctrl+Enter)
4. Kiểm tra cell trong sheet có được cập nhật chưa

---

## Bước 4 — Deploy làm Web App

1. Bấm **Deploy → New deployment**
2. Chọn type: **Web app**
3. Cấu hình:
   - **Execute as**: Me (tài khoản Google của bạn)
   - **Who has access**: Anyone *(hoặc "Anyone with Google Account" nếu muốn bảo mật hơn)*
4. Bấm **Deploy**
5. **Copy URL** dạng:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## Bước 5 — Cấu hình Vercel

1. Vào **Vercel Dashboard → Project → Settings → Environment Variables**
2. Thêm biến:
   - **Name**: `APPS_SCRIPT_WRITE_URL`
   - **Value**: URL vừa copy ở Bước 4
   - **Environments**: Production + Preview
3. Bấm **Save**
4. Redeploy project (hoặc push 1 commit nhỏ để trigger deploy mới)

---

## Cách hoạt động

Khi điều phối viên gán lái xe trong app:

```json
POST /api/dispatch-status
{
  "row_key": "PX-2024-001",
  "bo_phan": "MT",
  "ngay_giao": "2026-06-24",
  "lai_xe_phan_cong": "Nguyễn Văn A",
  "giao_nhan_phan_cong": "Trần Văn B"
}
```

App sẽ:
1. Lưu vào Supabase bảng `dispatch_status`
2. Gọi Apps Script URL với payload:
   ```json
   {
     "row_key": "PX-2024-001",
     "so_phieu": "PX-2024-001",
     "bo_phan": "MT",
     "lai_xe": "Nguyễn Văn A",
     "giao_nhan": "Trần Văn B",
     "ngay_giao": "2026-06-24"
   }
   ```
3. Apps Script tìm tab tháng 06.26, tìm hàng có Số Phiếu = "PX-2024-001", ghi vào cột Lái xe và Giao nhận

---

## Lưu ý quan trọng

- **Fire-and-forget**: nếu Apps Script lỗi, app vẫn hoạt động bình thường. Lỗi chỉ được log ở Vercel Functions log (`console.warn`).
- **Tìm tab tháng**: script tìm tab theo format `06.26`, `6.26`, ` 06.26`. Nếu tên tab khác, cần cập nhật hàm `findSheet()`.
- **Khi deploy lại**: mỗi lần sửa code script, phải **Deploy → Manage deployments → chọn deployment → Edit → New version → Deploy** (không tạo deployment mới).
- **Quyền truy cập**: lần đầu chạy, Google yêu cầu cấp quyền (`SpreadsheetApp`). Bấm "Review permissions → Allow".

---

## Troubleshooting

| Vấn đề | Nguyên nhân | Cách fix |
|--------|-------------|----------|
| Sheet không cập nhật | `APPS_SCRIPT_WRITE_URL` chưa set | Kiểm tra Vercel env vars |
| Lỗi "Không tìm thấy tab tháng" | Tên tab không khớp format | Xem `findSheet()`, thêm pattern |
| Lỗi "Không tìm thấy cột LÁI XE" | Header khác tên | Xem `norm()` + tên cột trong sheet |
| Lỗi "Không tìm thấy so_phieu" | Số phiếu không khớp chính xác | Kiểm tra khoảng trắng, chữ hoa/thường |
| 403/401 từ Apps Script | Who has access = "Only me" | Deploy lại với "Anyone" |
