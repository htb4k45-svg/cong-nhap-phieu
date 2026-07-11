-- ============================================================
-- MIGRATION: Bảng danh mục phường/xã hành chính MỚI (2025)
-- Cấu trúc 2 cấp: tỉnh/thành → phường/xã (đã bỏ cấp quận/huyện)
-- Dữ liệu: 34 tỉnh/thành, ~3321 phường/xã (decree 30/2026/QH16)
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- Xóa bảng cũ nếu có (dữ liệu cũ có quận/huyện)
DROP TABLE IF EXISTS phuong_xa;

CREATE TABLE phuong_xa (
  id         SERIAL PRIMARY KEY,
  ma_xa      TEXT NOT NULL UNIQUE,   -- Mã đơn vị (VD: "00004")
  ten_xa     TEXT NOT NULL,          -- Tên đầy đủ (VD: "Phường Ba Đình")
  loai_xa    TEXT,                   -- phường / xã
  ten_xa_ngan TEXT,                  -- Tên ngắn không tiền tố (VD: "Ba Đình")
  ma_tinh    TEXT NOT NULL,          -- Mã tỉnh/thành (VD: "01")
  ten_tinh   TEXT NOT NULL           -- Tên tỉnh/thành (VD: "Thành phố Hà Nội")
);

-- Index tìm kiếm
CREATE INDEX idx_phuong_xa_ten_xa    ON phuong_xa(ten_xa);
CREATE INDEX idx_phuong_xa_ten_ngan  ON phuong_xa(ten_xa_ngan);
CREATE INDEX idx_phuong_xa_ma_tinh   ON phuong_xa(ma_tinh);

-- RLS: đọc công khai
ALTER TABLE phuong_xa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON phuong_xa FOR SELECT USING (true);
CREATE POLICY "Service write" ON phuong_xa FOR ALL USING (true) WITH CHECK (true);
