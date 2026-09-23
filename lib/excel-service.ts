import ExcelJS from "exceljs";
import type {
  ExcelColumnInfo,
  ExcelSheetSummary,
  ExtractionFieldConfig,
  TargetColumnConfig,
} from "../types/crawler";

interface RichTextItem {
  text?: string;
}

interface CellRichText {
  richText: RichTextItem[];
}

interface CellTextObject {
  text: string;
}

interface CellFormulaResult {
  result?: unknown;
}

function isRichText(val: object): val is CellRichText {
  return "richText" in val && Array.isArray((val as CellRichText).richText);
}

function isTextObject(val: object): val is CellTextObject {
  return "text" in val && typeof (val as CellTextObject).text === "string";
}

function isFormulaResult(val: object): val is CellFormulaResult {
  return (
    "result" in val &&
    (val as CellFormulaResult).result !== undefined &&
    (val as CellFormulaResult).result !== null
  );
}

/**
 * Safely extracts a display value (string, number, or null) from an ExcelJS cell,
 * accounting for primitives, formula results, rich text, hyperlinks, and nulls.
 */
function extractCellValue(cell: ExcelJS.Cell): string | number | null {
  const val = cell.value;
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === "number") {
    return val;
  }
  if (typeof val === "string") {
    return val;
  }
  if (typeof val === "boolean") {
    return val ? "TRUE" : "FALSE";
  }
  if (typeof val === "object") {
    if (isRichText(val)) {
      return val.richText.map((t) => t.text ?? "").join("");
    }
    if (isTextObject(val)) {
      return val.text;
    }
    if (isFormulaResult(val)) {
      const res = val.result;
      if (typeof res === "number") return res;
      if (typeof res === "string") return res;
      return String(res);
    }
    // Fallback to cell.text getter if non-empty
    if (typeof cell.text === "string" && cell.text.length > 0) {
      return cell.text;
    }
    if (val instanceof Date) {
      return val.toISOString();
    }
    return String(val);
  }
  return cell.text || null;
}

/**
 * Inspects an Excel workbook buffer and returns summary metadata for each worksheet,
 * including sheet name, row count, header columns, and up to 5 sample data rows.
 */
export async function inspectExcelBuffer(buffer: Buffer): Promise<ExcelSheetSummary[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const summaries: ExcelSheetSummary[] = [];

  workbook.eachSheet((worksheet) => {
    const columns: ExcelColumnInfo[] = [];
    const headerRow = worksheet.getRow(1);

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      let headerText = "";
      if (cell.text && typeof cell.text === "string") {
        headerText = cell.text.trim();
      } else if (cell.value !== null && cell.value !== undefined) {
        headerText = String(cell.value).trim();
      }
      columns.push({
        index: colNumber,
        header: headerText || `Column ${colNumber}`,
      });
    });

    const sampleRows: (string | number | null)[][] = [];
    const maxSample = Math.min(worksheet.rowCount, 6);

    for (let r = 2; r <= maxSample; r++) {
      const row = worksheet.getRow(r);
      const rowValues: (string | number | null)[] = [];
      for (const col of columns) {
        const cell = row.getCell(col.index);
        rowValues.push(extractCellValue(cell));
      }
      sampleRows.push(rowValues);
    }

    summaries.push({
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columns,
      sampleRows,
    });
  });

  return summaries;
}

export interface EnrichExcelOptions {
  buffer: Buffer;
  sheetName: string;
  targetColumn: TargetColumnConfig;
  rowResults: Map<number, string>; // rowIndex (1-indexed) -> extracted text
}

/**
 * Injects extracted text into an Excel workbook buffer either by updating an
 * existing column or appending a new bold-header column, preserving all
 * other sheets, cells, styles, and formulas intact.
 */
export async function enrichExcelBuffer(options: EnrichExcelOptions): Promise<Buffer> {
  const { buffer, sheetName, targetColumn, rowResults } = options;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`Worksheet '${sheetName}' not found in Excel workbook.`);
  }

  let targetColIndex: number;

  if (targetColumn.mode === "existing") {
    targetColIndex = targetColumn.colIndex;
  } else {
    // Find next available column index after current max column in header row or sheet
    const headerRow = worksheet.getRow(1);
    let maxCol = Math.max(worksheet.columnCount || 0, 0);
    headerRow.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      if (colNumber > maxCol) {
        maxCol = colNumber;
      }
    });
    targetColIndex = maxCol + 1;

    // Set header cell for the new column
    const targetCell = headerRow.getCell(targetColIndex);
    targetCell.value = targetColumn.colName;
    targetCell.font = { bold: true };
  }

  // Write row results
  for (const [rowIndex, text] of rowResults.entries()) {
    const row = worksheet.getRow(rowIndex);
    const cell = row.getCell(targetColIndex);
    cell.value = text;
  }

  const outputBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outputBuffer);
}

export interface EnrichExcelMultiFieldOptions {
  buffer: Buffer;
  sheetName: string;
  fields: ExtractionFieldConfig[];
  rowResults: Map<number, Record<string, string>>; // rowIndex -> { [fieldId]: text }
}

export async function enrichExcelBufferMultiField(
  options: EnrichExcelMultiFieldOptions
): Promise<Buffer> {
  const { buffer, sheetName, fields, rowResults } = options;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`Worksheet '${sheetName}' not found in Excel workbook.`);
  }

  const headerRow = worksheet.getRow(1);
  let maxCol = Math.max(worksheet.columnCount || 0, 0);
  headerRow.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
    if (colNumber > maxCol) {
      maxCol = colNumber;
    }
  });

  // Map each field to its assigned column index in the sheet
  const fieldColumnMap = new Map<string, number>();

  for (const field of fields) {
    if (field.targetColumn.mode === "existing") {
      fieldColumnMap.set(field.id, field.targetColumn.colIndex);
    } else {
      maxCol += 1;
      const targetColIndex = maxCol;
      fieldColumnMap.set(field.id, targetColIndex);

      const headerCell = headerRow.getCell(targetColIndex);
      headerCell.value = field.targetColumn.colName;
      headerCell.font = { bold: true };
    }
  }

  // Populate row values
  for (const [rowIndex, fieldValues] of rowResults.entries()) {
    const row = worksheet.getRow(rowIndex);
    for (const [fieldId, text] of Object.entries(fieldValues)) {
      const colIndex = fieldColumnMap.get(fieldId);
      if (colIndex && text !== undefined && text !== null) {
        row.getCell(colIndex).value = text;
      }
    }
  }

  const outputBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outputBuffer);
}

