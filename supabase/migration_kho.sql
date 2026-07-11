-- Migration: tạo bảng kho
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS kho (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_kho      TEXT NOT NULL UNIQUE,
  ten_kho     TEXT NOT NULL,
  tinh_thanh  TEXT NOT NULL DEFAULT 'Hà Nội',
  dia_chi     TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: 5 kho Hà Nội ban đầu (local first)
INSERT INTO kho (ma_kho, ten_kho, tinh_thanh, sort_order) VALUES
  ('HN-01', 'Kho Hà Nội 01', 'Hà Nội', 1),
  ('HN-02', 'Kho Hà Nội 02', 'Hà Nội', 2),
  ('HN-03', 'Kho Hà Nội 03', 'Hà Nội', 3),
  ('HN-04', 'Kho Hà Nội 04', 'Hà Nội', 4),
  ('HN-05', 'Kho Hà Nội 05', 'Hà Nội', 5),
  ('HN-06', 'Kho Hà Nội 06', 'Hà Nội', 6)
ON CONFLICT (ma_kho) DO NOTHING;
