@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo          EXCEL-FLOW SETUP AND RUN SCRIPT (Windows)
echo =======================================================
echo.

REM Chuyen toi thu muc chua file batch
cd /d "%~dp0"

REM ---------------------------------------------------------
REM 0. KHOI TAO PATH CHO CAC CONG CU PHO BIEN
REM ---------------------------------------------------------
if exist "%USERPROFILE%\.bun\bin" set "PATH=%USERPROFILE%\.bun\bin;!PATH!"
if exist "C:\Program Files\nodejs" set "PATH=C:\Program Files\nodejs;!PATH!"
if exist "C:\Program Files\Git\cmd" set "PATH=C:\Program Files\Git\cmd;!PATH!"

REM ---------------------------------------------------------
REM 1. KIEM TRA VA CAI DAT GIT
REM ---------------------------------------------------------
echo [1/6] Kiem tra Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Git chua duoc cai dat. Dang tien hanh cai dat Git moi nhat qua winget...
    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo [ERROR] Cai dat Git that bai. Vui long cai dat Git thu cong tu https://git-scm.com/
        pause
        exit /b 1
    )
    call :refresh_path
) else (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do echo [OK] %%v
)
echo.

REM ---------------------------------------------------------
REM 2. KIEM TRA VA CAI DAT NODE.JS (LTS)
REM ---------------------------------------------------------
echo [2/6] Kiem tra Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js chua duoc cai dat. Dang tien hanh cai dat Node.js LTS qua winget...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo [ERROR] Cai dat Node.js that bai. Vui long cai dat Node.js thu cong tu https://nodejs.org/
        pause
        exit /b 1
    )
    call :refresh_path
) else (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js version: %%v
)
echo.

REM ---------------------------------------------------------
REM 3. KIEM TRA VA CAI DAT BUN
REM ---------------------------------------------------------
echo [3/6] Kiem tra Bun...
where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Bun chua duoc cai dat. Dang tien hanh cai dat Bun...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
    if !errorlevel! neq 0 (
        echo [ERROR] Cai dat Bun that bai. Vui long kiem tra ket noi mang hoac cai dat thu cong.
        pause
        exit /b 1
    )
    call :refresh_path
    if exist "%USERPROFILE%\.bun\bin" (
        set "PATH=%USERPROFILE%\.bun\bin;!PATH!"
    )
) else (
    for /f "tokens=*" %%v in ('bun -v 2^>nul') do echo [OK] Bun version: %%v
)
echo.

REM ---------------------------------------------------------
REM 4. XU LY REPOSITORY VA PULL CODE MOI NHAT
REM ---------------------------------------------------------
echo [4/6] Kiem tra ma nguon du an...
if exist ".git" (
    echo [*] Thu muc hien tai la Git repository.
    echo [*] Dang cap nhat code moi nhat...
    git checkout main 2>nul
    git pull origin main 2>nul || echo [!] Khong the pull code moi nhat - offline hoac co xung dot. Tiep tuc voi ma nguon hien tai...
) else if exist "excel-flow\.git" (
    echo [*] Thu muc excel-flow da ton tai. Dang chuyen vao excel-flow...
    cd excel-flow
    echo [*] Dang cap nhat code moi nhat...
    git checkout main 2>nul
    git pull origin main 2>nul || echo [!] Khong the pull code moi nhat - offline hoac co xung dot. Tiep tuc voi ma nguon hien tai...
) else (
    echo [*] Thu muc chua co code. Dang clone du an tu GitHub...
    git clone https://github.com/lehung1109/excel-flow.git
    if !errorlevel! neq 0 (
        echo [ERROR] Clone repository that bai! Vui long kiem tra URL repo hoac ket noi mang.
        pause
        exit /b 1
    )
    cd excel-flow
    git checkout main 2>nul
)
echo.

REM ---------------------------------------------------------
REM 5. THIET LAP FILE MOI TRUONG (.env.local)
REM ---------------------------------------------------------
echo [5/6] Thiet lap file moi truong (.env.local)...
set "COPY_ENV=0"
if not exist ".env.local" (
    set "COPY_ENV=1"
) else (
    for %%F in (".env.local") do if %%~zF equ 0 set "COPY_ENV=1"
)

if "!COPY_ENV!"=="1" (
    if exist ".env.example" (
        echo [*] Dang copy .env.example sang .env.local...
        copy /y ".env.example" ".env.local" >nul
        echo [OK] Da tao file .env.local thanh cong tu .env.example.
    ) else (
        echo [WARNING] Khong tim thay file .env.example de tao .env.local.
    )
) else (
    echo [OK] File .env.local da ton tai va hop le.
)
echo.

REM ---------------------------------------------------------
REM 6. CAI DAT DEPENDENCIES VA KHOI CHAY DU AN
REM ---------------------------------------------------------
echo [6/6] Cai dat dependencies va khoi chay...
echo [*] Dang chay: bun install...
call bun install
if %errorlevel% neq 0 (
    echo [ERROR] bun install gap loi!
    pause
    exit /b 1
)

echo [*] Dang chay: playwright install chromium...
call bunx playwright install chromium
if %errorlevel% neq 0 (
    echo [WARNING] bunx playwright install chromium gap su co, dang thu lai voi npx...
    call npx playwright install chromium
)

echo.
echo =======================================================
echo          KHOI DONG DU AN (bun run dev)
echo  Ung dung se san sang tai: http://localhost:3000
echo  Nhan Ctrl + C de dung server bat ky luc nao.
echo =======================================================
call bun run dev

if %errorlevel% neq 0 (
    echo.
    echo [!] Server da dung hoac gap loi.
)

echo.
echo =======================================================
echo Du an da dung. Nhan phim bat ky de dong cua so...
echo =======================================================
pause
exit /b 0

REM ---------------------------------------------------------
REM SUBROUTINE: CAP NHAT PATH CHO PHIEN LAM VIEC HIEN TAI
REM ---------------------------------------------------------
:refresh_path
for /f "delims=" %%P in ('powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')"') do (
    set "PATH=%%P;%USERPROFILE%\.bun\bin;C:\Program Files\Git\cmd;C:\Program Files\nodejs"
)
exit /b 0
