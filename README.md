# ExcelFlow — Web Scraper & Excel Data Enricher

<p align="center">
  <img src="public/icon.svg" width="96" height="96" alt="ExcelFlow Logo" />
</p>

<p align="center">
  <strong>Giải pháp cào dữ liệu website tự động đa luồng và làm giàu trực tiếp vào bảng tính Excel (.xlsx, .xls) bảo toàn 100% định dạng gốc</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=flat-square&logo=tailwindcss" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/Runtime-Bun-fbf0df?style=flat-square&logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/Database-Neon_Postgres-00e599?style=flat-square&logo=postgresql" alt="Neon Postgres" />
  <img src="https://img.shields.io/badge/Tests-Passing-success?style=flat-square" alt="Tests" />
</p>

---

## 📖 Giới Thiệu

**ExcelFlow** là ứng dụng web hiện đại giúp tự động hóa quy trình thu thập dữ liệu web (web scraping) và điền trực tiếp vào các file bảng tính Excel sẵn có. 

Người dùng chỉ cần tải lên file Excel chứa danh sách liên kết (URL), cấu hình các trường cần bóc tách (CSS Selectors), hệ thống sẽ tự động truy cập từng trang web, bóc tách nội dung và ghi kết quả vào các cột tương ứng mà không làm thay đổi hay xáo trộn bất kỳ kiểu dáng (styles), màu sắc, viền ô hay công thức tính toán nào của file Excel gốc.

---

## ✨ Tính Năng Nổi Bật

### 1. 📂 Nhập & Phân Tích Excel Thông Minh
- Hỗ trợ định dạng `.xlsx` và `.xls`.
- Hỗ trợ chuyển đổi linh hoạt giữa các Sheet trong file làm việc.
- Tự động quét và nhận diện cột chứa đường dẫn URL (`url`, `link`, `web`, `href`, `trang`...).
- Bảng xem trước dữ liệu (Preview) 5 dòng đầu kèm tổng số dòng thực tế.

### 2. 🎯 Bóc Tách Đa Trường Dữ Liệu (Multi-Field Extraction)
- Trích xuất đồng thời nhiều trường thông tin từ cùng một trang web (ví dụ: *Tiêu đề*, *Giá sản phẩm*, *Mô tả*, *Tình trạng hàng*...).
- **Cơ chế Selector Fallback**: Mỗi trường hỗ trợ danh sách nhiều CSS Selector theo thứ tự ưu tiên — tự động dùng selector dự phòng kế tiếp nếu phần tử phía trước không tồn tại trong trang.
- **Tùy chọn cột đích linh hoạt**:
  - Ghi đè hoặc điền vào cột có sẵn trong sheet.
  - Tự động tạo cột mới ở cuối bảng tính với tên tùy chọn và ghi chú trực quan.

### 3. ⚡ Hybrid Crawler Engine Tốc Độ Cao
- **Cheerio Engine**: Tải và phân tích cú pháp HTML tĩnh siêu tốc (xử lý hàng chục URL mỗi giây).
- **Playwright Headless Browser**: Tự động kích hoạt khi gặp website động (Single Page Apps, React, Vue, Angular, nội dung render bằng client JavaScript) hoặc khi Cheerio không tìm thấy kết quả.
- **Tương tác trước khi bóc tách (Pre-Click Selector)**: Hỗ trợ tự động click vào phần tử trước khi cào (ví dụ: bấm nút đóng popup, đồng ý Cookie, bấm *Xem thêm* hoặc *Hiện số điện thoại*).
- **Kiểm soát luồng & Hạn chế nghẽn (`p-limit`)**: Điều phối tải song song mượt mà, tránh tình trạng treo bộ nhớ hoặc bị chặn IP máy chủ.

### 4. 🧪 Thử Nghiệm Selector Trực Tiếp (Test Selector)
- Tích hợp Modal kiểm tra selector ngay trên giao diện trước khi tiến hành cào hàng loạt.
- Tự động lấy URL mẫu từ file Excel hoặc cho phép nhập URL tùy ý để xem trước kết quả bóc tách của từng trường.

### 5. 📊 Dashboard Giám Sát Tiến Độ Thời Gian Thực (SSE)
- Giao tiếp hai chiều thời gian thực thông qua **Server-Sent Events (SSE)**.
- Hiển thị thanh tiến trình trực quan (%), tốc độ xử lý và thời gian ước tính còn lại (ETA).
- Thống kê thời gian thực: *Tổng số*, *Thành công*, *Thất bại*, *Bỏ qua*.
- Bảng log chi tiết từng dòng dữ liệu kèm URL, selector khớp, nội dung trích xuất hoặc thông báo lỗi cụ thể.
- Nút **Dừng lại (Abort)** hỗ trợ ngắt tiến trình tức thời một cách an toàn.

### 6. 💾 Quản Lý Bộ Cấu Hình với Neon Serverless Postgres
- Lưu trữ các bộ quy tắc bóc tách đã định hình lên cơ sở dữ liệu đám mây **Neon Postgres**.
- Tải nhanh các cấu hình mẫu đã lưu cho những lần làm việc tiếp theo mà không cần cấu hình lại từ đầu.

---

## 🛠 Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ |
|---|---|
| **Frontend Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) & [React 19](https://react.dev/) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) & [Lucide React](https://lucide.dev/) |
| **Runtime & Test Runner** | [Bun](https://bun.sh/) (hỗ trợ cả Node.js v20+) |
| **Xử lý Excel** | [ExcelJS](https://github.com/exceljs/exceljs) |
| **Web Scraping** | [Cheerio](https://cheerio.js.org/) & [Playwright](https://playwright.dev/) |
| **Cơ sở dữ liệu** | [Neon Postgres](https://neon.tech/) via `@neondatabase/serverless` |
| **Concurrency & Streaming** | `p-limit`, Server-Sent Events (Web Streams API) |

---

## 🚀 Cài Đặt & Khởi Chạy

### 1. Yêu cầu hệ thống
- [Bun](https://bun.sh/) (khuyến nghị `v1.2+`) hoặc [Node.js](https://nodejs.org/) (`v20+`).

### 2. Cài đặt mã nguồn
```bash
# Clone repository
git clone https://github.com/lehung1109/excel-flow.git
cd excel-flow

# Cài đặt các gói phụ thuộc bằng Bun
bun install
```

### 3. Cài đặt trình duyệt Playwright (cho tính năng cào trang động)
```bash
bunx playwright install chromium
```

### 4. Cấu hình biến môi trường
Tạo file `.env.local` ở thư mục gốc (hoặc sao chép từ cấu hình mẫu):
```env
# Chuỗi kết nối Neon Postgres (dùng cho tính năng Lưu / Tải cấu hình)
DATABASE_URL="postgresql://user:password@ep-sample-pooler.neon.tech/neondb?sslmode=require"
```
*(Nếu chưa có database, ứng dụng vẫn hoạt động bình thường ở chế độ cào dữ liệu mà không bật lưu cấu hình).*

### 5. Khởi chạy môi trường phát triển
```bash
bun dev
```
Mở trình duyệt tại [http://localhost:3000](http://localhost:3000) để trải nghiệm ứng dụng.

---

## 🧪 Kiểm Thử (Testing)

Dự án có sẵn bộ kiểm thử toàn diện (Unit tests, Integration tests, Component tests, API tests):

```bash
# Chạy toàn bộ test suites
bun test

# Chạy test có báo cáo độ trễ chi tiết
bun test --timeout 15000
```

---

## 📁 Cấu Trúc Thư Mục

```text
excel-flow/
├── app/
│   ├── api/
│   │   ├── configs/         # API CRUD lưu trữ cấu hình Neon Postgres
│   │   ├── crawl/           # API tiếp nhận file Excel & Stream tiến trình qua SSE
│   │   ├── download/        # API tải file Excel kết quả đã làm giàu
│   │   └── test-selector/   # API kiểm tra selector trên URL đơn lẻ
│   ├── favicon.ico          # Favicon đa độ phân giải (16x16, 32x32, 48x48)
│   ├── icon.svg             # Vector app icon sắc nét
│   ├── globals.css          # Cấu hình Tailwind CSS v4
│   ├── layout.tsx           # Layout gốc với Metadata SEO & Favicon
│   └── page.tsx             # Giao diện chính 3 bước tích hợp
├── components/
│   ├── FileUploadZone.tsx   # Khu vực kéo thả & xem trước file Excel
│   ├── SelectorConfig.tsx   # Cấu hình trường, selector & cột đích
│   ├── LiveProgressDashboard.tsx # Bảng điều khiển tiến độ SSE & tải file
│   └── TestSelectorModal.tsx# Hộp thoại thử nghiệm selector trực tiếp
├── lib/
│   ├── crawler.ts           # Hybrid Scraper (Cheerio + Playwright fallback)
│   ├── db.ts                # Khởi tạo kết nối & schema Neon Postgres
│   └── excel.ts             # Đọc, trích xuất & ghi đè bảo toàn style file Excel
├── public/                  # Static assets & file demo mẫu
├── types/                   # Định nghĩa kiểu dữ liệu TypeScript
└── scripts/                 # Kịch bản hỗ trợ (tạo file mẫu, tạo icon...)
```

---

## ⚡ Lưu Ý Khi Triển Khai (Deployment Notes)

- **Vercel Serverless Function Limits**:
  - Gói miễn phí (Hobby) của Vercel giới hạn thời gian chạy function tối đa **10 giây** (gói Pro tối đa 60-300 giây).
  - Đối với file Excel có hàng nghìn dòng hoặc các trang web cần render Playwright lâu, khuyến nghị người dùng chọn phạm vi dòng (`startRow` - `endRow`, ví dụ: mỗi lần cào 20-50 dòng).
- **Bộ nhớ Vercel Body Limit**:
  - Request body của serverless function trên Vercel có giới hạn tối đa **4.5 MB**. Hãy đảm bảo file Excel tải lên không vượt quá dung lượng này.
- **Tiếp tục cào an toàn**:
  - Bật tùy chọn **"Bỏ qua các cột/ô đã có dữ liệu"** để khi chạy các dòng tiếp theo hoặc chạy lại file cũ, hệ thống sẽ tự động bỏ qua những dòng đã cào thành công trước đó, tiết kiệm tối đa thời gian.

---

## 📄 Bản Quyền & Giấy Phép

Dự án được phát triển dưới giấy phép [MIT](LICENSE).
