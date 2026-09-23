#!/usr/bin/env bash

# Thoat ngay neu co loi o cac buoc can thiet
set -e

echo "======================================================="
echo "      EXCEL-FLOW SETUP AND RUN SCRIPT (macOS / Linux)"
echo "======================================================="
echo ""

# Chuyen toi thu muc chua file script
cd "$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------
# 0. KHOI TAO PATH CHO CAC CONG CU PHO BIEN (macOS / Linux)
# ---------------------------------------------------------
if [ -d "/opt/homebrew/bin" ]; then
    export PATH="/opt/homebrew/bin:$PATH"
fi
if [ -d "/usr/local/bin" ]; then
    export PATH="/usr/local/bin:$PATH"
fi
export BUN_INSTALL="$HOME/.bun"
if [ -d "$BUN_INSTALL/bin" ]; then
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# ---------------------------------------------------------
# 1. KIEM TRA VA CAI DAT GIT
# ---------------------------------------------------------
echo "[1/6] Kiem tra Git..."
if ! command -v git >/dev/null 2>&1; then
    echo "[!] Git chua duoc cai dat."
    if command -v brew >/dev/null 2>&1; then
        echo "[*] Dang cai dat Git qua Homebrew..."
        brew install git
    else
        echo "[!] Homebrew chua duoc cai dat. Dang kich hoat Command Line Tools cua macOS..."
        xcode-select --install 2>/dev/null || true
        echo "[ERROR] Vui long hoan tat cai dat Command Line Tools hoac cai Homebrew (https://brew.sh) roi chay lai script."
        exit 1
    fi
fi
echo "[OK] $(git --version)"
echo ""

# ---------------------------------------------------------
# 2. KIEM TRA VA CAI DAT NODE.JS
# ---------------------------------------------------------
echo "[2/6] Kiem tra Node.js..."
if ! command -v node >/dev/null 2>&1; then
    echo "[!] Node.js chua duoc cai dat."
    if command -v brew >/dev/null 2>&1; then
        echo "[*] Dang cai dat Node.js qua Homebrew..."
        brew install node
    else
        echo "[ERROR] Khong tim thay Homebrew de tu dong cai Node.js."
        echo "Vui long cai dat Node.js tu https://nodejs.org/ hoac cai Homebrew (https://brew.sh) roi chay lai script."
        exit 1
    fi
fi
echo "[OK] Node.js version: $(node -v)"
echo ""

# ---------------------------------------------------------
# 3. KIEM TRA VA CAI DAT BUN
# ---------------------------------------------------------
echo "[3/6] Kiem tra Bun..."
if ! command -v bun >/dev/null 2>&1; then
    echo "[!] Bun chua duoc cai dat. Dang tien hanh cai dat Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

if ! command -v bun >/dev/null 2>&1; then
    echo "[ERROR] Khong the tim thay lenh 'bun' sau khi cai dat."
    echo "Vui long them '$HOME/.bun/bin' vao PATH trong ~/.zshrc hoac ~/.bashrc."
    exit 1
fi
echo "[OK] Bun version: $(bun -v)"
echo ""

# ---------------------------------------------------------
# 4. XU LY REPOSITORY VA PULL CODE MOI NHAT
# ---------------------------------------------------------
echo "[4/6] Kiem tra ma nguon du an..."
if [ -d ".git" ]; then
    echo "[*] Thu muc hien tai la Git repository."
    echo "[*] Dang cap nhat code moi nhat..."
    git checkout main 2>/dev/null || true
    git pull origin main 2>/dev/null || echo "[!] Khong the pull code moi nhat (offline hoac co xung dot). Tiep tuc voi ma nguon hien tai..."
elif [ -d "excel-flow/.git" ]; then
    echo "[*] Thu muc excel-flow da ton tai. Dang chuyen vao excel-flow..."
    cd excel-flow
    echo "[*] Dang cap nhat code moi nhat..."
    git checkout main 2>/dev/null || true
    git pull origin main 2>/dev/null || echo "[!] Khong the pull code moi nhat (offline hoac co xung dot). Tiep tuc voi ma nguon hien tai..."
else
    echo "[*] Thu muc chua co code. Dang clone du an tu GitHub..."
    git clone https://github.com/lehung1109/excel-flow.git
    cd excel-flow
    git checkout main 2>/dev/null || true
fi
echo ""

# ---------------------------------------------------------
# 5. THIET LAP FILE MOI TRUONG (.env.local)
# ---------------------------------------------------------
echo "[5/6] Thiet lap file moi truong (.env.local)..."
if [ ! -s ".env.local" ]; then
    if [ -f ".env.example" ]; then
        echo "[*] Dang copy .env.example sang .env.local..."
        cp .env.example .env.local
        echo "[OK] Da tao file .env.local thanh cong tu .env.example."
    else
        echo "[WARNING] Khong tim thay file .env.example de tao .env.local."
    fi
else
    echo "[OK] File .env.local da ton tai va hop le."
fi
echo ""

# ---------------------------------------------------------
# 6. CAI DAT DEPENDENCIES VA KHOI CHAY DU AN
# ---------------------------------------------------------
echo "[6/6] Cai dat dependencies va khoi chay..."
echo "[*] Dang chay: bun install..."
bun install

echo "[*] Dang chay: playwright install chromium..."
if ! bunx playwright install chromium; then
    echo "[WARNING] bunx playwright install chromium gap su co, dang thu lai voi npx..."
    npx playwright install chromium
fi

echo ""
echo "======================================================="
echo "         KHOI DONG DU AN (bun run dev)"
echo "  Ung dung se san sang tai: http://localhost:3000"
echo "  Nhan Ctrl + C de dung server bat ky luc nao."
echo "======================================================="
bun run dev
