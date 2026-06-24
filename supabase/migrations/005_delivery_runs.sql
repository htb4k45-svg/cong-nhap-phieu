-- Bảng lưu thông tin chốt chuyến xe theo ngày
CREATE TABLE IF NOT EXISTS delivery_runs (
  id            BIGSERIAL PRIMARY KEY,
  driver_name   TEXT        NOT NULL,
  ngay_chay     DATE        NOT NULL,
  km_bat_dau    INTEGER,
  km_ket_thuc   INTEGER,
  km_thuc_te    INTEGER GENERATED ALWAYS AS (
    CASE WHEN km_ket_thuc IS NOT NULL AND km_bat_dau IS NOT NULL
         THEN km_ket_thuc - km_bat_dau
         ELSE NULL END
  ) STORED,
  so_don_giao   INTEGER DEFAULT 0,
  so_don_hoan   INTEGER DEFAULT 0,
  ghi_chu       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(driver_name, ngay_chay)
);

-- Index cho query theo ngày và lái xe
CREATE INDEX IF NOT EXISTS idx_delivery_runs_date   ON delivery_runs(ngay_chay DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_driver ON delivery_runs(driver_name);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_delivery_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_runs_updated_at ON delivery_runs;
CREATE TRIGGER trg_delivery_runs_updated_at
  BEFORE UPDATE ON delivery_runs
  FOR EACH ROW EXECUTE FUNCTION update_delivery_runs_updated_at();

-- RLS
ALTER TABLE delivery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON delivery_runs
  FOR ALL USING (true) WITH CHECK (true);
