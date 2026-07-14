/**
 * POST /api/nhien-lieu/unrar
 * Nhận:
 *   - FormData { archive } : file nhỏ < 4MB
 *   - JSON { storagePath } : file lớn đã upload lên Supabase Storage
 * Trả về NDJSON: { name, ky_hieu_hd, so_hd, dvbh, mst, pdfBase64 }
 * Gửi TẤT CẢ PDF kể cả không parse được
 */

export const maxDuration = 60; // Vercel: cho phép tối đa 60s
export const dynamic    = 'force-dynamic';

import { join }       from 'path';
import { tmpdir }     from 'os';
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, chmodSync } from 'fs';
import { execFile }   from 'child_process';
import { promisify }  from 'util';
import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase';

const execFileAsync = promisify(execFile);

// ── 7zip-bin ──────────────────────────────────────────────────────────────────
let path7za = null;
try {
  const bin = await import('7zip-bin');
  path7za = bin.path7za;
  try { chmodSync(path7za, 0o755); } catch (_) {}
} catch (e) {
  console.error('[unrar] 7zip-bin không tìm thấy:', e.message);
}

// ── PDF text extraction ───────────────────────────────────────────────────────
async function pdfToText(buf) {
  try {
    const mod   = await import('pdf-parse/lib/pdf-parse.js');
    const parse = mod.default || mod;
    const data  = await parse(buf, { max: 3 });
    return data.text || '';
  } catch { return ''; }
}

// ── Invoice text parser ───────────────────────────────────────────────────────
function normalizeKyHieu(ky) {
  if (!ky) return null;
  return ky.replace(/^\d+[\/]?/, '').trim() || null;
}

function parseInvoiceText(rawText) {
  const t = rawText.replace(/\s+/g, ' ');

  // ── Ký hiệu ──
  let ky_hieu_hd = null;
  const mKy = t.match(/[Kk][yý]\s*hi[eệ]u\s*(?:h[oó]a\s*[đd][ơo]n\s*)?[:\-]?\s*([A-Z0-9\/]{3,20})/u);
  if (mKy) ky_hieu_hd = normalizeKyHieu(mKy[1].trim());
  if (!ky_hieu_hd) {
    const mKy2 = t.match(/\b(K\d{2}[A-Z]{2,5})\b/);
    if (mKy2) ky_hieu_hd = mKy2[1];
  }

  // ── Số HĐ ──
  let so_hd = null;
  const mBefore = t.match(/(\d{3,})\s+S[ốo]\s*[:\-]/iu);
  if (mBefore) so_hd = mBefore[1];
  if (!so_hd) {
    const mAfter = t.match(/\bS[ốo]\s*[:\-]\s*(\d{4,12})/iu);
    if (mAfter) so_hd = mAfter[1];
  }
  if (!so_hd) {
    const mHD = t.match(/S[ốo]\s*h[oó]a\s*[đd][ơo]n\s*[:\-]?\s*(\d{4,12})/iu);
    if (mHD) so_hd = mHD[1];
  }

  // ── Đơn vị bán hàng ──
  let dvbh = null;
  const mDVBH = t.match(/[Đđ][Ơơô]n\s+v[iị]\s+b[aá]n\s+h[aà]ng\s*[:\-]?\s*([^\n]{5,100})/iu);
  if (mDVBH) dvbh = mDVBH[1].replace(/\s+M[ãa]\s*s[ốo].*$/i, '').trim();

  // ── Mã số thuế ──
  let mst = null;
  const mMST = t.match(/M[ãa]\s*s[ốo]\s*thu[eế]\s*[:\-]?\s*(\d[\d\-]{9,14})/iu)
            || t.match(/\bMST\s*[:\-]?\s*(\d[\d\-]{9,14})/i);
  if (mMST) mst = mMST[1].replace(/-/g, '').trim();

  return {
    ky_hieu_hd: ky_hieu_hd || null,
    so_hd:      so_hd      || null,
    dvbh:       dvbh       || null,
    mst:        mst        || null,
  };
}

// ── Walk helpers ──────────────────────────────────────────────────────────────
function walkPdfs(dir) {
  const res = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) res.push(...walkPdfs(full));
    else if (e.name.toLowerCase().endsWith('.pdf')) res.push({ name: e.name, path: full });
  }
  return res;
}

function walkArchives(dir) {
  const res = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) res.push(...walkArchives(full));
    else {
      const l = e.name.toLowerCase();
      if (l.endsWith('.zip') || l.endsWith('.rar') || l.endsWith('.7z')) res.push(full);
    }
  }
  return res;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req) {
  if (!path7za) {
    return new Response(
      JSON.stringify({ error: '7zip-bin chưa cài. Chạy: npm install' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Đọc file archive (FormData hoặc Supabase Storage path) ────────────────
  let archiveBuf, archiveName;
  let storageCleanup = null; // path để xóa sau khi xử lý xong
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      // File lớn: tải từ Supabase Storage
      const { storagePath } = await req.json();
      if (!storagePath) throw new Error('Thiếu storagePath');
      const db = createAdminClient();
      const { data: blob, error } = await db.storage.from('nhien-lieu').download(storagePath);
      if (error) throw new Error('Lỗi tải Supabase Storage: ' + error.message);
      archiveBuf    = Buffer.from(await blob.arrayBuffer());
      archiveName   = storagePath.split('/').pop();
      storageCleanup = storagePath;
    } else {
      // File nhỏ: FormData
      const fd   = await req.formData();
      const file = fd.get('archive');
      if (!file) throw new Error('Thiếu file archive');
      archiveBuf  = Buffer.from(await file.arrayBuffer());
      archiveName = file.name;
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const tmpDir  = join(tmpdir(), 'unrar-' + randomUUID());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')); } catch (_) {}
      };
      try {
        mkdirSync(tmpDir, { recursive: true });
        const ext         = '.' + archiveName.split('.').pop().toLowerCase();
        const archivePath = join(tmpDir, 'archive' + ext);
        const outDir      = join(tmpDir, 'out');
        mkdirSync(outDir, { recursive: true });
        writeFileSync(archivePath, archiveBuf);

        // Giải nén archive gốc
        send({ progress: 'Đang giải nén archive...' });
        await execFileAsync(path7za, ['x', '-y', archivePath, `-o${outDir}`], { timeout: 120_000 });

        // Giải nén đệ quy tất cả archive lồng nhau
        let changed = true;
        while (changed) {
          changed = false;
          for (const fp of walkArchives(outDir)) {
            try {
              await execFileAsync(path7za, ['x', '-y', fp, `-o${join(fp, '..')}`], { timeout: 60_000 });
              rmSync(fp);
              changed = true;
            } catch (_) {}
          }
        }

        // Thu thập tất cả PDF
        const pdfs = walkPdfs(outDir);
        send({ progress: `Tìm thấy ${pdfs.length} file PDF, đang đọc nội dung...` });

        // Parse song song theo lô 8 để tăng tốc
        const BATCH  = 8;
        let processed = 0;
        let parsed    = 0;

        for (let i = 0; i < pdfs.length; i += BATCH) {
          const batch   = pdfs.slice(i, i + BATCH);
          const results = await Promise.all(batch.map(async ({ name, path: p }) => {
            try {
              const pdfBuf = readFileSync(p);
              const text   = await pdfToText(pdfBuf);
              const info   = parseInvoiceText(text);
              return { name, ...info, pdfBase64: pdfBuf.toString('base64') };
            } catch (_) { return null; }
          }));

          for (const r of results) {
            if (!r) continue;
            processed++;
            if (r.ky_hieu_hd && r.so_hd) parsed++;
            send(r); // gửi TẤT CẢ PDF
          }

          send({ progress: `Đã đọc ${Math.min(i + BATCH, pdfs.length)}/${pdfs.length} PDF...` });
        }

        send({ done: true, total: pdfs.length, parsed });
      } catch (e) {
        send({ error: e.message });
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        // Xóa file tạm trên Supabase Storage
        if (storageCleanup) {
          try {
            const db = createAdminClient();
            await db.storage.from('nhien-lieu').remove([storageCleanup]);
          } catch (_) {}
        }
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
}
