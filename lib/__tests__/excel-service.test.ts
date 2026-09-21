import { describe, expect, it } from "bun:test";
import ExcelJS from "exceljs";
import { enrichExcelBuffer, inspectExcelBuffer } from "../excel-service";

async function createSampleExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.addRow(["ID", "Name", "URL", "Price"]);
  sheet.addRow([1, "Item 1", "https://example.com/1", 100]);
  sheet.addRow([2, "Item 2", "https://example.com/2", 200]);
  const uint8 = await workbook.xlsx.writeBuffer();
  return Buffer.from(uint8);
}

async function createComplexExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet1 = workbook.addWorksheet("SheetOne");
  sheet1.addRow(["ColA", "ColB", "ColC", "ColD"]);

  // Row 2: number, string, null, formula
  sheet1.addRow([42, "TextValue", null]);
  sheet1.getCell("D2").value = { formula: "SUM(10, 20)", result: 30 };

  // Row 3: richText, hyperlink, empty, number
  sheet1.getCell("A3").value = {
    richText: [{ text: "Rich " }, { font: { bold: true }, text: "Text" }],
  };
  sheet1.getCell("B3").value = {
    text: "Click Me",
    hyperlink: "https://example.com",
  };
  sheet1.getCell("D3").value = 999;

  const sheet2 = workbook.addWorksheet("SheetTwo");
  sheet2.addRow(["OnlyHeader"]);

  const uint8 = await workbook.xlsx.writeBuffer();
  return Buffer.from(uint8);
}

describe("excel-service", () => {
  describe("inspectExcelBuffer", () => {
    it("returns correct sheets, headers, and sample rows", async () => {
      const buffer = await createSampleExcel();
      const summaries = await inspectExcelBuffer(buffer);

      expect(summaries.length).toBe(1);
      expect(summaries[0].name).toBe("Products");
      expect(summaries[0].rowCount).toBe(3);
      expect(summaries[0].columns.map((c) => c.header)).toEqual([
        "ID",
        "Name",
        "URL",
        "Price",
      ]);
      expect(summaries[0].sampleRows.length).toBe(2);
      expect(summaries[0].sampleRows[0][0]).toBe(1);
      expect(summaries[0].sampleRows[0][1]).toBe("Item 1");
      expect(summaries[0].sampleRows[0][2]).toBe("https://example.com/1");
      expect(summaries[0].sampleRows[0][3]).toBe(100);
      expect(summaries[0].sampleRows[1][1]).toBe("Item 2");
    });

    it("handles multiple sheets, formula results, rich text, hyperlinks, and nulls", async () => {
      const buffer = await createComplexExcel();
      const summaries = await inspectExcelBuffer(buffer);

      expect(summaries.length).toBe(2);
      expect(summaries[0].name).toBe("SheetOne");
      expect(summaries[0].columns.map((c) => c.header)).toEqual([
        "ColA",
        "ColB",
        "ColC",
        "ColD",
      ]);

      const sampleRows = summaries[0].sampleRows;
      expect(sampleRows.length).toBe(2);

      // Row 2 checks
      expect(sampleRows[0][0]).toBe(42);
      expect(sampleRows[0][1]).toBe("TextValue");
      expect(sampleRows[0][2]).toBeNull();
      expect(sampleRows[0][3]).toBe(30);

      // Row 3 checks
      expect(sampleRows[1][0]).toBe("Rich Text");
      expect(sampleRows[1][1]).toBe("Click Me");
      expect(sampleRows[1][2]).toBeNull();
      expect(sampleRows[1][3]).toBe(999);

      // Sheet 2 checks (header only)
      expect(summaries[1].name).toBe("SheetTwo");
      expect(summaries[1].columns.length).toBe(1);
      expect(summaries[1].sampleRows.length).toBe(0);
    });
  });

  describe("enrichExcelBuffer", () => {
    it("adds a new column with bold header and preserves existing rows", async () => {
      const buffer = await createSampleExcel();
      const enrichedBuffer = await enrichExcelBuffer({
        buffer,
        sheetName: "Products",
        targetColumn: { mode: "new", colName: "Extracted_Title" },
        rowResults: new Map([
          [2, "Extracted Title 1"],
          [3, "Extracted Title 2"],
        ]),
      });

      const readWorkbook = new ExcelJS.Workbook();
      await readWorkbook.xlsx.load(enrichedBuffer as unknown as ExcelJS.Buffer);
      const sheet = readWorkbook.getWorksheet("Products");
      expect(sheet).toBeDefined();

      // Check header of 5th column
      const headerRow = sheet!.getRow(1);
      const headerCell = headerRow.getCell(5);
      expect(headerCell.value).toBe("Extracted_Title");
      expect(headerCell.font?.bold).toBe(true);

      // Check row values
      expect(sheet!.getRow(2).getCell(5).value).toBe("Extracted Title 1");
      expect(sheet!.getRow(3).getCell(5).value).toBe("Extracted Title 2");

      // Check existing values remained intact
      expect(sheet!.getRow(2).getCell(1).value).toBe(1);
      expect(sheet!.getRow(2).getCell(2).value).toBe("Item 1");
      expect(sheet!.getRow(3).getCell(4).value).toBe(200);
    });

    it("updates an existing column and leaves untouched rows and columns intact", async () => {
      const buffer = await createSampleExcel();
      const enrichedBuffer = await enrichExcelBuffer({
        buffer,
        sheetName: "Products",
        targetColumn: { mode: "existing", colIndex: 4 }, // Price column
        rowResults: new Map([[2, "$99"]]),
      });

      const readWorkbook = new ExcelJS.Workbook();
      await readWorkbook.xlsx.load(enrichedBuffer as unknown as ExcelJS.Buffer);
      const sheet = readWorkbook.getWorksheet("Products");
      expect(sheet!.getRow(2).getCell(4).value).toBe("$99");
      expect(sheet!.getRow(3).getCell(4).value).toBe(200); // untouched row
      expect(sheet!.getRow(2).getCell(2).value).toBe("Item 1"); // untouched col
    });

    it("preserves other sheets and formulas when enriching", async () => {
      const buffer = await createComplexExcel();
      const enrichedBuffer = await enrichExcelBuffer({
        buffer,
        sheetName: "SheetOne",
        targetColumn: { mode: "new", colName: "NewCol" },
        rowResults: new Map([[2, "Result for row 2"]]),
      });

      const readWorkbook = new ExcelJS.Workbook();
      await readWorkbook.xlsx.load(enrichedBuffer as unknown as ExcelJS.Buffer);

      // Both sheets preserved
      expect(readWorkbook.worksheets.length).toBe(2);
      const sheet1 = readWorkbook.getWorksheet("SheetOne");
      const sheet2 = readWorkbook.getWorksheet("SheetTwo");
      expect(sheet1).toBeDefined();
      expect(sheet2).toBeDefined();
      expect(sheet2!.getRow(1).getCell(1).value).toBe("OnlyHeader");

      // Formula preserved
      const cellD2 = sheet1!.getCell("D2");
      const formulaVal = cellD2.value as { formula?: string };
      expect(formulaVal?.formula).toBe("SUM(10, 20)");
    });
  });
});
