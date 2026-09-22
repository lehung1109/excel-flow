import ExcelJS from "exceljs";

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Danh sách mẫu");

  sheet.columns = [
    { header: "STT", key: "id", width: 8 },
    { header: "Tên mục", key: "name", width: 25 },
    { header: "Đường dẫn URL", key: "url", width: 70 },
    { header: "Ghi chú gợi ý Selector", key: "note", width: 35 },
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

  const sampleRows = [
    {
      id: 1,
      name: "Sách: A Light in the Attic",
      url: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
      note: "Thử selector: h1 hoặc .price_color",
      extracted: null,
    },
    {
      id: 2,
      name: "Sách: Tipping the Velvet",
      url: "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html",
      note: "Thử selector: h1 hoặc .price_color",
      extracted: null,
    },
    {
      id: 3,
      name: "Sách: Soumission",
      url: "https://books.toscrape.com/catalogue/soumission_998/index.html",
      note: "Thử selector: h1 hoặc .price_color",
      extracted: null,
    },
    {
      id: 4,
      name: "Wikipedia: Next.js",
      url: "https://en.wikipedia.org/wiki/Next.js",
      note: "Thử selector: h1#firstHeading, h1",
      extracted: null,
    },
    {
      id: 5,
      name: "Wikipedia: Web Scraping",
      url: "https://en.wikipedia.org/wiki/Web_scraping",
      note: "Thử selector: h1#firstHeading, h1",
      extracted: null,
    },
    {
      id: 6,
      name: "Quotes: Albert Einstein",
      url: "https://quotes.toscrape.com/",
      note: "Thử selector: .quote .text, h1 a",
      extracted: null,
    },
  ];

  sampleRows.forEach((row) => {
    const r = sheet.addRow(row);
    r.alignment = { vertical: "middle" };
    r.height = 22;
  });

  await workbook.xlsx.writeFile("demo_sample.xlsx");
  await workbook.xlsx.writeFile("public/demo_sample.xlsx");
  console.log("Successfully created demo_sample.xlsx and public/demo_sample.xlsx");
}

main().catch(console.error);
