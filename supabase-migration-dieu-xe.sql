-- ============================================================
-- MIGRATION: Thêm tính năng điều xe
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- 1. Thêm cột ma_lenh nếu chưa có
ALTER TABLE phieu ADD COLUMN IF NOT EXISTS ma_lenh TEXT;

-- 2. Thêm cột trang_thai_giao (riêng với trang_thai hiện tại)
ALTER TABLE phieu ADD COLUMN IF NOT EXISTS trang_thai_giao TEXT DEFAULT 'cho_giao'
  CHECK (trang_thai_giao IN ('cho_giao', 'dang_giao', 'da_giao', 'huy'));

-- 3. Index tìm kiếm theo ngày cần giao (dùng nhiều trong trang điều xe)
CREATE INDEX IF NOT EXISTS idx_phieu_ngay_can_giao ON phieu(ngay_can_giao);
CREATE INDEX IF NOT EXISTS idx_phieu_bo_phan ON phieu(bo_phan);
CREATE INDEX IF NOT EXISTS idx_phieu_trang_thai_giao ON phieu(trang_thai_giao);

-- 4. Cập nhật tất cả phiếu đã có sang trạng thái "chờ giao"
UPDATE phieu SET trang_thai_giao = 'cho_giao' WHERE trang_thai_giao IS NULL;
