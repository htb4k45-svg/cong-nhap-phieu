-- 009_xe_nhien_lieu.sql
-- Quản lý xe, km theo tháng, giao dịch nhiên liệu PVOIL

-- ── 1. Bảng xe (master theo biển số) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xe (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  bien_so      text    UNIQUE NOT NULL,        -- VD: '29D-131.77'
  tai_trong    text,                            -- VD: '945 kg', '6.5 tấn'
  dinh_muc_l_100km numeric,                    -- Định mức khoán (lít/100km)
  ghi_chu      text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE xe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all xe" ON xe FOR ALL USING (true) WITH CHECK (true);

-- Seed: tất cả xe từ dữ liệu PVOIL tháng 6/2026 + file Km định mức
INSERT INTO xe (bien_so, tai_trong, dinh_muc_l_100km) VALUES
  ('29A-450.07', '945 kg',   null),
  ('29B-147.97', '945 kg',   null),
  ('29C-649.91', '6.5 tấn',  16.2),
  ('29D-032.21', '945 kg',   14),
  ('29D-120.72', '1.25 tấn', 14),
  ('29D-131.77', '945 kg',   12),
  ('29D-135.59', '945 kg',   14),
  ('29D-135.87', '945 kg',   14),
  ('29D-136.54', '945 kg',   10),
  ('29D-429.64', '945 kg',   14),
  ('29H-150.51', '945 kg',   null),
  ('29H-428.15', '945 kg',   null),
  ('30A-597.77', '945 kg',   null),
  ('30B-253.09', '945 kg',   14),
  ('30F-651.48', '945 kg',   null),
  ('30K-118.91', '945 kg',   null),
  ('30K-132.74', '945 kg',   null),
  ('30K-184.67', '945 kg',   null),
  ('51D-776.21', '945 kg',   10),
  ('51E-305.72', '945 kg',   12),
  ('51E-313.12', '945 kg',   14),
  ('51E-332.16', '945 kg',   14),
  ('51L-903.56', '945 kg',   14)
ON CONFLICT (bien_so) DO NOTHING;

-- ── 2. Bảng km theo tháng ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xe_km_thang (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  bien_so      text    NOT NULL,
  thang        text    NOT NULL,               -- 'YYYY-MM'
  km_dau       integer,
  km_cuoi      integer,
  ton_dau_lit  numeric,
  ton_cuoi_lit numeric,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(bien_so, thang)
);

CREATE INDEX IF NOT EXISTS xe_km_thang_thang_idx ON xe_km_thang(thang);

ALTER TABLE xe_km_thang ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all xe_km_thang" ON xe_km_thang FOR ALL USING (true) WITH CHECK (true);

-- Seed: dữ liệu km tháng 06/2026 từ file MAU_Km_dinh_muc_xe.xlsx
INSERT INTO xe_km_thang (bien_so, thang, km_dau, km_cuoi, ton_dau_lit, ton_cuoi_lit) VALUES
  ('29D-131.77', '2026-06', 139750, 142272, 32.73, 40),
  ('29D-135.59', '2026-06', 131619, 134513, 30,    75),
  ('29D-429.64', '2026-06',  92861,  95821, 30,    75),
  ('29D-032.21', '2026-06',  53359,  56114, 20,    75),
  ('30B-253.09', '2026-06',  11735,  14951, 10,    70),
  ('29C-649.91', '2026-06', 417096, 421765, 20,    80),
  ('29D-135.87', '2026-06',  84157,  86330, 24,    70),
  ('29D-120.72', '2026-06', 288650, 290353, 40,    80),
  ('51E-313.12', '2026-06',  61646,  63782, 44,    70),
  ('51E-305.72', '2026-06',  56430,  58767, 40,    36),
  ('51E-332.16', '2026-06',  36322,  38833, 50,    70),
  ('51L-903.56', '2026-06',  27941,  30607, 30,    75),
  ('29D-136.54', '2026-06', 119560, 122769, 12,    40),
  ('51D-776.21', '2026-06', 110697, 114447, 32,    40)
ON CONFLICT (bien_so, thang) DO NOTHING;

-- ── 3. Bảng giao dịch nhiên liệu (import từ PVOIL) ─────────────────────────
CREATE TABLE IF NOT EXISTS nhien_lieu_gd (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  bien_so          text    NOT NULL,           -- normalized: '29D-131.77'
  bien_so_raw      text,                        -- nguyên gốc từ PVOIL: '29D13177'
  ngay_gd          timestamptz,
  so_gd            text,
  tai_khoan        text,
  ten_tai_xe       text,
  don_vi_kd        text,
  chxd             text,
  don_vi           text,
  mat_hang         text,
  so_luong_lit     numeric,
  gia_chua_ck      numeric,
  tien_hang_chua_ck numeric,
  thue_gtgt_chua_ck numeric,
  tong_dt_chua_ck  numeric,
  gia_co_ck        numeric,
  tien_hang_co_ck  numeric,
  thue_gtgt_co_ck  numeric,
  tong_dt_co_ck    numeric,
  ten_goi_tat      text,
  mau_so_hd        text,
  ky_hieu_hd       text,
  so_hd            text,
  ngay_hd          date,
  ten_dv_ban       text,
  mst_dv_ban       text,
  khu_vuc          text,
  trang_thai       text,
  thang            text,                        -- 'YYYY-MM'
  import_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nhien_lieu_bien_so_idx  ON nhien_lieu_gd(bien_so);
CREATE INDEX IF NOT EXISTS nhien_lieu_thang_idx     ON nhien_lieu_gd(thang);
CREATE INDEX IF NOT EXISTS nhien_lieu_ngay_gd_idx   ON nhien_lieu_gd(ngay_gd);

ALTER TABLE nhien_lieu_gd ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all nhien_lieu_gd" ON nhien_lieu_gd FOR ALL USING (true) WITH CHECK (true);
