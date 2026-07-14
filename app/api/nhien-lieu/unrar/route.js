/**
 * POST /api/nhien-lieu/unrar
 * Nhận 1 file RAR/ZIP, giải nén đệ quy, trả về NDJSON:
 * { name, ky_hieu_hd, so_hd, pdfBase64 }
 * Dùng 7zip-bin (binary tích hợp, không cần cài thêm gì).
 */

import { join }          from 'path';
import { mkdirSync, writeFileSync, rmSync, readFileSync,
         readdirSync, chmodSync, statSync }          from 'fs';
import { execFile }      from 'child_process';
import { promisify }     from 'util';
import { randomUUID }    from 'crypto';

const execFileAsync = promisify(execFile);

// ── 7zip-bin ──────────────────────────────────────────────────────────────────
let path7za = null;
try {
  const bin = await import('7zip-bin');
  path7za = bin.path7za;
  try { chmodSync(path7za, 0o755); } catch (_) {}
} catch (e) {
  console.error('[unrar API] 7zip-bin không tìm thấy:', e.message);
}

// ── PDF text extraction ───────────────────────────────────────────────────────
async function pdfToText(buf) {
  try {
    // Dùng lib path tránh lỗi import fixture của pdf-parse
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    const parse = mod.default || mod;
    const data  = await parse(buf, { max: 2 });
    return data.text || '';
  } catch (e) {
    return '';
  }
}

// ── Invoice text parser (port từ client) ──────────────────────────────────────
function normalizeKyHieu(ky) {
  if (!ky) return null;
  return ky.replace(/^\d+[\/]?/, '').trim() || null;
}

function parseInvoiceText(text) {
  const t = text.replace(/\s+/g, ' ');
  let ky = null;
  const mKy = t.match(/[Kk][yý]\s*hi[eệ]u\s*[:\-]?\s*([A-Z0-9\/]{3,20})/u);
  if (mKy) ky = normalizeKyHieu(mKy[1].trim());
  let so = null;
  const mBefore = t.match(/(\d{3,})\s+S[ốo]\s*[:\-]/iu);
  if (mBefore) so = mBefore[1];
  if (!so) {
    const mAfter = t.match(/\bS[ốo]\s*[:\-]\s*(\d{4,12})/iu);
    if (mAfter) so = mAfter[1];
  }
  return { ky_hieu_hd: ky || null, so_hd: so || null };
}

function normSoHD(s) {
  if (!s) return '';
  const n = parseInt(s, 10);
  return isNaN(n) ? s : String(n);
}

// ── Scan directory recursively for PDFs ───────────────────────────────────────
function walkPdfs(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkPdfs(full));
    else if (entry.name.toLowerCase().endsWith('.pdf')) results.push({ name: entry.name, path: full });
  }
  return results;
}

function walkArchives(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkArchives(full));
    else {
      const l = entry.name.toLowerCase();
      if (l.endsWith('.zip') || l.endsWith('.rar') || l.endsWith('.7z')) results.push(full);
    }
  }
  return results;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req) {
  if (!path7za) {
    return new Response(
      JSON.stringify({ error: '7zip-bin chưa cài. Chạy: npm install 7zip-bin pdf-parse' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Đọc form data TRƯỚC khi tạo stream
  let archiveBuf, archiveName;
  try {
    const fd  = await req.formData();
    const file = fd.get('archive');
    if (!file) throw new Error('Thiếu file archive');
    archiveBuf  = Buffer.from(await file.arrayBuffer());
    archiveName = file.name;
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const tmpDir  = join('/tmp', 'unrar-' + randomUUID());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        mkdirSync(tmpDir, { recursive: true });
        const ext         = archiveName.toLowerCase().replace(/.*\./, '.');
        const archivePath = join(tmpDir, 'archive' + ext);
        const outDir      = join(tmpDir, 'out');
        mkdirSync(outDir, { recursive: true });

        writeFileSync(archivePath, archiveBuf);

        // Giải nén archive gốc
        await execFileAsync(path7za, ['x', '-y', archivePath, `-o${outDir}`], { timeout: 120_000 });

        // Giải nén đệ quy tất cả archive lồng nhau (giống app.py)
        let changed = true;
        while (changed) {
          changed = false;
          for (const fp of walkArchives(outDir)) {
            try {
              const dir = join(fp, '..');
              await execFileAsync(path7za, ['x', '-y', fp, `-o${dir}`], { timeout: 60_000 });
              rmSync(fp);
              changed = true;
            } catch (_) {}
          }
        }

        // Thu thập và parse từng PDF
        const pdfs = walkPdfs(outDir);
        send({ progress: `Tìm thấy ${pdfs.length} file PDF, đang đọc...` });

        for (const { name, path } of pdfs) {
          try {
            const pdfBuf = readFileSync(path);
            const text   = await pdfToText(pdfBuf);
            const { ky_hieu_hd, so_hd } = parseInvoiceText(text);
            if (ky_hieu_hd && so_hd) {
              send({ name, ky_hieu_hd, so_hd, pdfBase64: pdfBuf.toString('base64') });
            }
          } catch (_) {}
        }

        send({ done: true, total: pdfs.length });
      } catch (e) {
        send({ error: e.message });
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' }
  });
}
