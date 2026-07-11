-- Migration: Thêm sức tải cho từng lái xe
-- Chạy trong Supabase SQL Editor

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS suc_tai_thung INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suc_tai_kg    INTEGER DEFAULT 0;

COMMENT ON COLUMN drivers.suc_tai_thung IS 'Sức tải tối đa (thùng), 0 = không giới hạn';
COMMENT ON COLUMN drivers.suc_tai_kg    IS 'Sức tải tối đa (kg), 0 = không giới hạn';

-- Cập nhật sức tải mẫu (chỉnh lại theo thực tế của từng xe)
-- Xe tải lớn: ~200 thùng, xe tải nhỏ: ~100 thùng, xe máy/bán tải: ~50 thùng
UPDATE drivers SET suc_tai_thung = 200 WHERE vai_tro = 'lai_xe';
-- Phụ xe không cần sức tải (họ đi cùng lái xe)
-- UPDATE drivers SET suc_tai_thung = 0 WHERE vai_tro = 'giao_nhan';
