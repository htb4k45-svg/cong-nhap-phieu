-- Migration: Thêm biển số xe + sức tải (chạy 1 lần trong Supabase SQL Editor)
-- Nếu đã chạy migration suc_tai rồi, chỉ cần phần bien_so

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS bien_so     VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suc_tai_thung INTEGER    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suc_tai_kg    INTEGER    DEFAULT 0;

COMMENT ON COLUMN drivers.bien_so      IS 'Biển số xe (VD: 51C-123.45)';
COMMENT ON COLUMN drivers.suc_tai_thung IS 'Sức tải tối đa (thùng), 0 = không giới hạn';
COMMENT ON COLUMN drivers.suc_tai_kg    IS 'Sức tải tối đa (kg), 0 = không giới hạn';

-- Cập nhật sức tải mẫu cho lái xe (chỉnh theo thực tế)
-- UPDATE drivers SET suc_tai_thung = 200 WHERE vai_tro = 'lai_xe';

-- Cập nhật biển số (ví dụ — thay tên và biển số thực tế)
-- UPDATE drivers SET bien_so = '51C-123.45' WHERE ten = 'Nguyễn Văn A';
