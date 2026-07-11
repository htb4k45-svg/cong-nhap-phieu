"""
Giải nén toàn bộ hóa đơn PDF từ archive (ZIP + RAR lồng nhau)
Cách dùng:
  python giai-nen-hoadon.py "HD HH 062026.zip"   # hoặc .rar
  python giai-nen-hoadon.py "D:\\Downloads\\HD HH 062026.zip"

Kết quả: thư mục "output_pdf" trong cùng thư mục với file archive
"""

import sys, os, zipfile, io, shutil

# Thử import rarfile (cần cài: pip install rarfile)
try:
    import rarfile
    rarfile.UNRAR_TOOL = "unrar"   # Windows: C:\Program Files\WinRAR\UnRAR.exe
    HAS_RAR = True
except ImportError:
    HAS_RAR = False

def extract_all(archive_path, out_dir):
    """Giải nén đệ quy tất cả PDF từ archive (ZIP/RAR), bao gồm archive lồng nhau."""
    collected = 0
    skipped_rar = 0

    def process_zip(zf, prefix=""):
        nonlocal collected
        for item in zf.infolist():
            name = item.filename
            lower = name.lower()
            if lower.endswith('/'):        # thư mục
                continue
            basename = os.path.basename(name)
            lower_base = basename.lower()

            if lower_base.endswith('.pdf'):
                data = zf.read(item)
                safe = basename.replace('/', '_').replace('\\', '_')
                dest = os.path.join(out_dir, safe)
                # Tránh trùng tên
                if os.path.exists(dest):
                    base, ext = os.path.splitext(safe)
                    i = 1
                    while os.path.exists(dest):
                        dest = os.path.join(out_dir, f"{base}_{i}{ext}")
                        i += 1
                with open(dest, 'wb') as f:
                    f.write(data)
                collected += 1
                print(f"  ✓ {basename}")

            elif lower_base.endswith('.zip'):
                data = zf.read(item)
                inner = zipfile.ZipFile(io.BytesIO(data))
                process_zip(inner, prefix=basename + "/")

            elif lower_base.endswith('.rar') and HAS_RAR:
                data = zf.read(item)
                tmp = os.path.join(out_dir, '__tmp__.rar')
                with open(tmp, 'wb') as f:
                    f.write(data)
                process_rar(tmp)
                os.remove(tmp)

    def process_rar(rar_path):
        nonlocal collected, skipped_rar
        if not HAS_RAR:
            skipped_rar += 1
            return
        try:
            with rarfile.RarFile(rar_path) as rf:
                for item in rf.infolist():
                    name = item.filename
                    basename = os.path.basename(name)
                    lower = basename.lower()
                    if lower.endswith('.pdf'):
                        data = rf.read(item)
                        dest = os.path.join(out_dir, basename)
                        if os.path.exists(dest):
                            base, ext = os.path.splitext(basename)
                            i = 1
                            while os.path.exists(dest):
                                dest = os.path.join(out_dir, f"{base}_{i}{ext}")
                                i += 1
                        with open(dest, 'wb') as f:
                            f.write(data)
                        collected += 1
                        print(f"  ✓ {basename}")
                    elif lower.endswith('.zip'):
                        data = rf.read(item)
                        inner = zipfile.ZipFile(io.BytesIO(data))
                        process_zip(inner)
                    elif lower.endswith('.rar'):
                        data = rf.read(item)
                        tmp = os.path.join(out_dir, '__tmp2__.rar')
                        with open(tmp, 'wb') as f:
                            f.write(data)
                        process_rar(tmp)
                        if os.path.exists(tmp):
                            os.remove(tmp)
        except Exception as e:
            print(f"  ⚠ Lỗi đọc RAR {rar_path}: {e}")

    # Đọc archive gốc
    lower = archive_path.lower()
    if lower.endswith('.zip'):
        with zipfile.ZipFile(archive_path) as zf:
            process_zip(zf)
    elif lower.endswith('.rar'):
        process_rar(archive_path)
    else:
        print(f"Không hỗ trợ định dạng: {archive_path}")
        return 0, 0

    return collected, skipped_rar


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    src = sys.argv[1]
    if not os.path.exists(src):
        print(f"Không tìm thấy file: {src}")
        sys.exit(1)

    out = os.path.join(os.path.dirname(os.path.abspath(src)), 'output_pdf')
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)

    print(f"Đang giải nén: {src}")
    print(f"Thư mục kết quả: {out}")
    print()

    n, skipped = extract_all(src, out)

    print()
    print(f"✅ Tổng cộng: {n} file PDF")
    if skipped:
        print(f"⚠  Bỏ qua {skipped} file RAR (cần cài rarfile + UnRAR)")
        print("   pip install rarfile")
        print("   Đặt UnRAR.exe vào PATH hoặc chỉnh rarfile.UNRAR_TOOL trong script")
    print(f"👉 Thư mục PDF: {out}")
