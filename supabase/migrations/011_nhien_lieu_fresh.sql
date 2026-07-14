-- 011_nhien_lieu_fresh.sql
-- Cập nhật schema cho nhien-lieu: thêm cột PDF đối chiếu, tạo bảng chi phí phát sinh
-- Chạy trong Supabase SQL Editor

-- ── Thêm cột vào nhien_lieu_gd ────────────────────────────────────────────
ALTER TABLE nhien_lieu_gd
  ADD COLUMN IF NOT EXISTS co_pdf         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_dvbh       text,
  ADD COLUMN IF NOT EXISTS pdf_mst        text,
  ADD COLUMN IF NOT EXISTS lenh_canh_bao  text;

-- ── Bảng chi phí phát sinh ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nhien_lieu_chiphi (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  thang      text NOT NULL,         -- 'YYYY-MM'
  bien_so    text,
  loai_cp    text,
  so_tien    numeric,
  ghi_chu    text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nhien_lieu_chiphi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all nhien_lieu_chiphi"
  ON nhien_lieu_chiphi FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_chiphi_thang ON nhien_lieu_chiphi(thang);
