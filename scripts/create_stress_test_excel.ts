import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";

interface SampleTemplate {
  name: string;
  url: string;
  note: string;
}

// Danh sách các mẫu URL thực tế có thể cào ổn định và bóc tách thành công
const BASE_SAMPLES: SampleTemplate[] = [
  {
    name: "Sách: A Light in the Attic",
    url: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    note: "h1, .price_color, .instock",
  },
  {
    name: "Sách: Tipping the Velvet",
    url: "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html",
    note: "h1, .price_color, .instock",
  },
  {
    name: "Sách: Soumission",
    url: "https://books.toscrape.com/catalogue/soumission_998/index.html",
    note: "h1, .price_color, .instock",
  },
  {
    name: "Sách: Sharp Objects",
    url: "https://books.toscrape.com/catalogue/sharp-objects_997/index.html",
    note: "h1, .price_color, .instock",
  },
  {
    name: "Sách: Sapiens",
    url: "https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html",
    note: "h1, .price_color, .instock",
  },
  {
    name: "Quotes: Albert Einstein",
    url: "https://quotes.toscrape.com/",
    note: ".quote .text, .quote .author, h1 a",
  },
  {
    name: "Quotes: Trang 2",
    url: "https://quotes.toscrape.com/page/2/",
    note: ".quote .text, .quote .author",
  },
  {
    name: "Wikipedia: Next.js",
    url: "https://en.wikipedia.org/wiki/Next.js",
    note: "h1#firstHeading, #mw-content-text p",
  },
  {
    name: "Wikipedia: Web Scraping",
    url: "https://en.wikipedia.org/wiki/Web_scraping",
    note: "h1#firstHeading, #mw-content-text p",
  },
  {
    name: "Wikipedia: React",
    url: "https://en.wikipedia.org/wiki/React_(software)",
    note: "h1#firstHeading, #mw-content-text p",
  },
  {
    name: "Wikipedia: TypeScript",
    url: "https://en.wikipedia.org/wiki/TypeScript",
    note: "h1#firstHeading, #mw-content-text p",
  },
  {
    name: "Wikipedia: Bun",
    url: "https://en.wikipedia.org/wiki/Bun_(software)",
    note: "h1#firstHeading, #mw-content-text p",
  },
];

// Sinh thêm 50 trang danh mục của Books to Scrape (mỗi trang chứa 20 sách)
for (let p = 1; p <= 50; p++) {
  BASE_SAMPLES.push({
    name: `Books to Scrape - Danh mục Trang ${p}`,
    url: `https://books.toscrape.com/catalogue/page-${p}.html`,
    note: ".product_pod h3 a, .product_pod .price_color",
  });
}

// Sinh thêm 10 trang của Quotes to Scrape
for (let q = 1; q <= 10; q++) {
  BASE_SAMPLES.push({
    name: `Quotes to Scrape - Trang ${q}`,
    url: `https://quotes.toscrape.com/page/${q}/`,
    note: ".quote .text, .quote .author",
  });
}

async function createStressFile(
  rowCount: number,
  outputFilename: string,
  sheetTitle: string
) {
  const startTime = Date.now();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetTitle);

  sheet.columns = [
    { header: "STT", key: "id", width: 10 },
    { header: "Tên mục", key: "name", width: 35 },
    { header: "Đường dẫn URL", key: "url", width: 75 },
    { header: "Ghi chú gợi ý Selector", key: "note", width: 40 },
    { header: "Nội dung trích xuất", key: "extracted", width: 35 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF059669" }, // Emerald 600
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 28;

  const totalSamples = BASE_SAMPLES.length;

  for (let i = 1; i <= rowCount; i++) {
    const sample = BASE_SAMPLES[(i - 1) % totalSamples];
    const r = sheet.addRow({
      id: i,
      name: `[#${i}] ${sample.name}`,
      url: sample.url,
      note: sample.note,
      extracted: null,
    });
    r.alignment = { vertical: "middle" };
    r.height = 20;
  }

  const outDir = path.resolve(process.cwd(), "public");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const targetPath = path.join(outDir, outputFilename);
  await workbook.xlsx.writeFile(targetPath);

  const stats = fs.statSync(targetPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  const sizeKB = (stats.size / 1024).toFixed(1);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(
    `✅ [${outputFilename}] Đã tạo ${rowCount.toLocaleString()} dòng (${sizeMB} MB / ${sizeKB} KB) trong ${duration}s -> ${targetPath}`
  );
}

async function createHeavyPayloadFile(
  outputFilename: string,
  sheetTitle: string
) {
  const startTime = Date.now();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetTitle);

  sheet.columns = [
    { header: "STT", key: "id", width: 10 },
    { header: "Mã định danh Payload", key: "guid", width: 38 },
    { header: "Tên mục", key: "name", width: 35 },
    { header: "Đường dẫn URL", key: "url", width: 75 },
    { header: "Ghi chú gợi ý Selector", key: "note", width: 40 },
    { header: "Mô tả chi tiết kiểm thử (Dữ liệu tải nặng)", key: "description", width: 80 },
    { header: "Nội dung trích xuất", key: "extracted", width: 35 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDC2626" }, // Red 600 - cảnh báo payload nặng
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 28;

  const totalSamples = BASE_SAMPLES.length;
  // Khoảng 55.000 dòng với chuỗi metadata mô tả đa dạng để đạt kích thước ~3.6 - 3.8 MB sau khi nén zip XLSX
  const targetRows = 55000;

  for (let i = 1; i <= targetRows; i++) {
    const sample = BASE_SAMPLES[(i - 1) % totalSamples];
    const pseudoGuid = `stress-uuid-${i.toString(16).padStart(8, "0")}-${(i * 31).toString(16).padStart(4, "0")}-${(i * 127).toString(16).padStart(4, "0")}`;
    const payloadText = `[Record #${i}] Giả lập kiểm thử chịu tải upload Vercel Serverless Function (Payload limit 4.5MB). Checksum: ${(i * 99991).toString(36)}. Dữ liệu chuỗi dài kiểm tra khả năng xử lý DOM/XML ExcelJS, đo mức tiêu thụ Heap Memory RAM và thời gian giải nén tệp. Random: ${Math.sin(i).toString(36)}`;

    const r = sheet.addRow({
      id: i,
      guid: pseudoGuid,
      name: `[#${i}] ${sample.name}`,
      url: sample.url,
      note: sample.note,
      description: payloadText,
      extracted: null,
    });
    r.alignment = { vertical: "middle" };
    r.height = 20;
  }

  const outDir = path.resolve(process.cwd(), "public");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const targetPath = path.join(outDir, outputFilename);
  await workbook.xlsx.writeFile(targetPath);

  const stats = fs.statSync(targetPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  const sizeKB = (stats.size / 1024).toFixed(1);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(
    `🔥 [${outputFilename}] Đã tạo ${targetRows.toLocaleString()} dòng tải nặng (${sizeMB} MB / ${sizeKB} KB) trong ${duration}s -> ${targetPath}`
  );
}

async function main() {
  console.log("🚀 Bắt đầu sinh bộ file Stress Test cho Vercel & ExcelFlow...\n");

  // 1. Level 1: 500 dòng (test crawl thật trong 60s trên Vercel)
  await createStressFile(
    500,
    "stress_test_500.xlsx",
    "500 Dòng (Level 1)"
  );

  // 2. Level 2: 2.000 dòng (test tiệm cận timeout 60s & Abort controller)
  await createStressFile(
    2000,
    "stress_test_2000.xlsx",
    "2000 Dòng (Level 2)"
  );

  // 3. Level 3: 10.000 dòng (test lượng dòng lớn, RAM preview client & serverless memory)
  await createStressFile(
    10000,
    "stress_test_10000.xlsx",
    "10000 Dòng (Level 3)"
  );

  // 4. Level 4: Test dung lượng tiệm cận ngưỡng 4.5MB Payload của Vercel (~3.5 - 3.8 MB)
  await createHeavyPayloadFile(
    "stress_test_payload_4mb.xlsx",
    "Payload 4MB (Level 4)"
  );

  console.log("\n🎉 Hoàn thành sinh tất cả file stress test!");
}

main().catch((err) => {
  console.error("❌ Lỗi khi sinh file stress test:", err);
  process.exit(1);
});
