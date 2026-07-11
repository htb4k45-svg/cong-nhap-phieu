-- Migration: tích hợp B2B Portal ↔ Dispatch App
-- Chạy trong Supabase SQL Editor (1 lần)

-- 1. Thêm cột b2b_order_code vào dispatch_status
--    Dùng để biết phiếu này tương ứng với đơn B2B nào
ALTER TABLE dispatch_status
  ADD COLUMN IF NOT EXISTS b2b_order_code TEXT DEFAULT NULL;

COMMENT ON COLUMN dispatch_status.b2b_order_code IS
  'Mã đơn hàng từ B2B Portal (orders.order_code). NULL = đơn thường (không phải B2B).';

-- 2. Index để query nhanh khi webhook cần tìm đơn B2B theo driver + ngày
CREATE INDEX IF NOT EXISTS idx_ds_b2b_order ON dispatch_status(b2b_order_code)
  WHERE b2b_order_code IS NOT NULL;
