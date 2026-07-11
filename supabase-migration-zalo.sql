-- Migration: Thêm zalo_user_id vào bảng drivers
-- Dùng cho tính năng gửi lệnh điều xe qua Zalo
-- Chạy trong Supabase SQL Editor

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS zalo_user_id TEXT DEFAULT NULL;

COMMENT ON COLUMN drivers.zalo_user_id IS
  'Zalo user ID của lái xe — lấy từ OA webhook sau khi tài xế nhắn tin cho OA';
