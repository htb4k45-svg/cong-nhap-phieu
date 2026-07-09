-- Migration 010: thêm tracking PDF đối chiếu vào nhien_lieu_gd
-- Chạy trong Supabase SQL Editor

ALTER TABLE nhien_lieu_gd
  ADD COLUMN IF NOT EXISTS pdf_file          text,
  ADD COLUMN IF NOT EXISTS pdf_verified_at   timestamptz;

-- Index để tìm kiếm theo ky_hieu_hd + so_hd nhanh hơn
CREATE INDEX IF NOT EXISTS idx_nhien_lieu_gd_hd
  ON nhien_lieu_gd (ky_hieu_hd, so_hd);
