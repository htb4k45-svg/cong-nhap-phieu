#!/usr/bin/env node
/**
 * Import phường/xã hành chính MỚI (34 tỉnh/thành, bỏ cấp quận/huyện)
 * Nguồn: github.com/ThangLeQuoc/vietnamese-provinces-database (cập nhật 30/2026/QH16)
 *
 * Chạy: node scripts/import-phuong-xa.js
 *
 * Tỉnh được import: Hà Nội + tỉnh lân cận phía Bắc (mở rộng sau)
 */

const fs   = require('fs');
const path = require('path');

// ── Đọc env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌  Không tìm thấy .env.local'); process.exit(1);
  }
  const env = {};
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
  return env;
}

// ── Tỉnh cần import (mã mới sau sáp nhập 2025) ───────────────────────────────
// Mở rộng thêm bằng cách thêm mã vào mảng này
const TARGET_PROVINCES = [
  '01',  // Hà Nội
  '24',  // Bắc Giang (mã mới sau sáp nhập có thể thay đổi)
  '26',  // Vĩnh Phúc → sáp nhập thành Phú Thọ, mã cũ có thể đổi
  '27',  // Bắc Ninh
  '33',  // Hưng Yên
  '35',  // Hà Nam
  '17',  // Hòa Bình → sáp nhập vào Phú Thọ/Hà Nội
  '19',  // Thái Nguyên
  // Thêm tỉnh khác nếu cần
];

// ── Tách loại đơn vị từ tên ──────────────────────────────────────────────────
function parseLoai(fullName) {
  if (!fullName) return { loai: null, ten_ngan: fullName };
  if (fullName.startsWith('Phường '))    return { loai: 'phường',   ten_ngan: fullName.slice(7) };
  if (fullName.startsWith('Xã '))        return { loai: 'xã',       ten_ngan: fullName.slice(3) };
  if (fullName.startsWith('Thị trấn ')) return { loai: 'thị trấn', ten_ngan: fullName.slice(9) };
  return { loai: null, ten_ngan: fullName };
}

// ── Escape SQL ────────────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏙️  Import phường/xã hành chính mới (34 tỉnh/thành)\n');

  const env = loadEnv();
  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY
                    || env.SUPABASE_SECRET_KEY
                    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌  Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env.local');
    process.exit(1);
  }

  // ── Fetch data từ GitHub ──────────────────────────────────────────────────
  const DATA_URL = 'https://raw.githubusercontent.com/ThangLeQuoc/vietnamese-provinces-database/master/json/vn_only_simplified_json_generated_data_vn_units.json';

  process.stdout.write('📥  Đang tải dữ liệu từ GitHub... ');
  let allProvinces;
  try {
    const res = await fetch(DATA_URL, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allProvinces = await res.json();
    console.log(`✅  ${allProvinces.length} tỉnh/thành`);
  } catch (err) {
    console.error(`\n❌  Lỗi fetch: ${err.message}`);
    process.exit(1);
  }

  // ── Lọc tỉnh cần thiết ───────────────────────────────────────────────────
  const targeted = allProvinces.filter(p => TARGET_PROVINCES.includes(p.Code));
  if (targeted.length === 0) {
    console.warn('⚠️  Không tìm thấy tỉnh nào trong TARGET_PROVINCES. Kiểm tra lại mã tỉnh.');
    console.log('Các mã tỉnh có trong data:');
    allProvinces.forEach(p => console.log(`  ${p.Code}: ${p.FullName}`));
    process.exit(1);
  }

  // ── Parse wards ──────────────────────────────────────────────────────────
  const wards = [];
  for (const prov of targeted) {
    let count = 0;
    for (const w of (prov.Wards || [])) {
      const { loai, ten_ngan } = parseLoai(w.FullName);
      wards.push({
        ma_xa:      w.Code,
        ten_xa:     w.FullName,
        loai_xa:    loai,
        ten_xa_ngan: ten_ngan,
        ma_tinh:    prov.Code,
        ten_tinh:   prov.FullName,
      });
      count++;
    }
    console.log(`  📍 ${prov.FullName} (${prov.Code}): ${count} phường/xã`);
  }

  console.log(`\n📊  Tổng: ${wards.length} phường/xã từ ${targeted.length} tỉnh/thành\n`);

  // ── Lưu SQL backup ────────────────────────────────────────────────────────
  const sqlFile = path.join(__dirname, '..', 'phuong-xa-data.sql');
  const chunkSize = 500;
  let sql = '-- Dữ liệu phường/xã hành chính mới (34 tỉnh/thành, 2025)\n';
  sql += '-- Nguồn: github.com/ThangLeQuoc/vietnamese-provinces-database\n\n';
  sql += 'DELETE FROM phuong_xa WHERE id >= 0;\n\n';

  for (let i = 0; i < wards.length; i += chunkSize) {
    const chunk = wards.slice(i, i + chunkSize);
    sql += 'INSERT INTO phuong_xa (ma_xa, ten_xa, loai_xa, ten_xa_ngan, ma_tinh, ten_tinh) VALUES\n';
    sql += chunk.map(w =>
      `  (${esc(w.ma_xa)}, ${esc(w.ten_xa)}, ${esc(w.loai_xa)}, ${esc(w.ten_xa_ngan)}, ${esc(w.ma_tinh)}, ${esc(w.ten_tinh)})`
    ).join(',\n');
    sql += '\nON CONFLICT (ma_xa) DO UPDATE SET ten_xa=EXCLUDED.ten_xa, ten_xa_ngan=EXCLUDED.ten_xa_ngan;\n\n';
  }

  fs.writeFileSync(sqlFile, sql, 'utf8');
  console.log(`💾  Đã lưu SQL backup → phuong-xa-data.sql\n`);

  // ── Upload lên Supabase ───────────────────────────────────────────────────
  console.log('📤  Đang upload lên Supabase...\n');

  // Xóa dữ liệu cũ
  const delRes = await fetch(`${SUPABASE_URL}/rest/v1/phuong_xa?id=gte.0`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
  });
  if (!delRes.ok && delRes.status !== 404) {
    const txt = await delRes.text();
    console.warn(`⚠️  Không xóa được dữ liệu cũ (${delRes.status}): ${txt}`);
    console.warn('→  Hãy chạy supabase-migration-phuong-xa.sql trước nếu chưa tạo bảng\n');
  } else {
    console.log('  🗑️  Đã xóa dữ liệu cũ');
  }

  let inserted = 0;
  for (let i = 0; i < wards.length; i += chunkSize) {
    const chunk = wards.slice(i, i + chunkSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/phuong_xa`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      console.error(`\n❌  Lỗi batch ${i}–${i + chunkSize}: ${await res.text()}`);
    } else {
      inserted += chunk.length;
      process.stdout.write(`  ✅  ${inserted}/${wards.length}\r`);
    }
  }

  console.log(`\n\n🎉  Hoàn thành! Đã import ${inserted} phường/xã vào Supabase`);
  console.log(`\n📋  Để thêm tỉnh khác, mở scripts/import-phuong-xa.js và thêm mã tỉnh vào TARGET_PROVINCES`);

  // In danh sách tất cả tỉnh có sẵn
  console.log('\n📜  Tất cả tỉnh/thành có trong data:');
  allProvinces.forEach(p => {
    const isTarget = TARGET_PROVINCES.includes(p.Code);
    console.log(`  ${isTarget ? '✅' : '  '} ${p.Code}: ${p.FullName} (${(p.Wards||[]).length} phường/xã)`);
  });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
