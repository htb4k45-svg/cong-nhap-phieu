@echo off
echo ============================================
echo   DEPLOY - Cong Nhap Phieu - Hong Ha
echo ============================================
echo.

cd /d "E:\Viet\HH Van Hanh\cong-nhap-phieu"

echo [1/3] Kiem tra thay doi...
git status

echo.
echo [2/3] Them tat ca file moi...
git add .

echo.
set /p msg="Nhap mo ta thay doi (Enter de dung 'cap nhat'): "
if "%msg%"=="" set msg=cap nhat

git commit -m "%msg%"

echo.
echo [3/3] Day len GitHub (Vercel tu dong deploy)...
git push origin main

echo.
echo ============================================
echo   XONG! Vercel se tu dong cap nhat web.
echo   Kiem tra tai: https://vercel.com
echo ============================================
pause
