import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import pLimit from "p-limit";
import { enrichExcelBuffer, enrichExcelBufferMultiField } from "@/lib/excel-service";
import { scrapeHybrid, scrapeMultiField } from "@/lib/scraper";
import { saveTempFile } from "@/lib/temp-store";
import { calculateETA, normalizeUrl } from "@/lib/url-utils";
import type { ExtractionFieldConfig, FieldCrawlResult, TargetColumnConfig } from "@/types/crawler";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function extractCellUrlValue(cell: ExcelJS.Cell): unknown {
  const val = cell.value;
  if (val === null || val === undefined) {
    return cell.text || null;
  }
  if (typeof val === "object") {
    if ("hyperlink" in val && typeof (val as { hyperlink?: unknown }).hyperlink === "string") {
      return (val as { hyperlink: string }).hyperlink;
    }
    if ("text" in val && typeof (val as { text?: unknown }).text === "string") {
      return (val as { text: string }).text;
    }
    if ("richText" in val && Array.isArray((val as { richText?: unknown[] }).richText)) {
      return (val as { richText: Array<{ text?: string }> }).richText
        .map((t) => t.text ?? "")
        .join("");
    }
    if ("result" in val && (val as { result?: unknown }).result !== undefined) {
      return String((val as { result: unknown }).result);
    }
  }
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return val;
  }
  return cell.text || null;
}

function isCellNonEmpty(cell: ExcelJS.Cell): boolean {
  const val = cell.value;
  if (val === null || val === undefined) {
    return typeof cell.text === "string" && cell.text.trim().length > 0;
  }
  if (typeof val === "string") {
    return val.trim().length > 0;
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return true;
  }
  if (typeof val === "object") {
    if ("text" in val && typeof (val as { text?: unknown }).text === "string") {
      return (val as { text: string }).text.trim().length > 0;
    }
    if (
      "result" in val &&
      (val as { result?: unknown }).result !== undefined &&
      (val as { result?: unknown }).result !== null
    ) {
      return String((val as { result: unknown }).result).trim().length > 0;
    }
    if ("richText" in val && Array.isArray((val as { richText?: unknown[] }).richText)) {
      const full = (val as { richText: Array<{ text?: string }> }).richText
        .map((t) => t.text ?? "")
        .join("")
        .trim();
      return full.length > 0;
    }
    return String(val).trim().length > 0;
  }
  return typeof cell.text === "string" && cell.text.trim().length > 0;
}

function getCellStringValue(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) {
    return cell.text || "";
  }
  if (typeof val === "string") {
    return val;
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return String(val);
  }
  if (typeof val === "object") {
    if ("text" in val && typeof (val as { text?: unknown }).text === "string") {
      return (val as { text: string }).text;
    }
    if (
      "result" in val &&
      (val as { result?: unknown }).result !== undefined &&
      (val as { result?: unknown }).result !== null
    ) {
      return String((val as { result: unknown }).result);
    }
    if ("richText" in val && Array.isArray((val as { richText?: unknown[] }).richText)) {
      return (val as { richText: Array<{ text?: string }> }).richText
        .map((t) => t.text ?? "")
        .join("");
    }
    return String(val);
  }
  return cell.text || "";
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Dữ liệu multipart/form-data không hợp lệ." },
      { status: 400 }
    );
  }

  // 1. Validate file
  const file = formData.get("file");
  if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") {
    return NextResponse.json(
      { success: false, error: "Tệp Excel bị thiếu hoặc không hợp lệ." },
      { status: 400 }
    );
  }

  // 2. Validate urlColIndex
  const rawUrlColIndex = formData.get("urlColIndex");
  if (!rawUrlColIndex) {
    return NextResponse.json(
      { success: false, error: "Chỉ số cột URL bị thiếu." },
      { status: 400 }
    );
  }
  const urlColIndex = parseInt(String(rawUrlColIndex), 10);
  if (isNaN(urlColIndex) || urlColIndex < 1) {
    return NextResponse.json(
      { success: false, error: "Chỉ số cột URL phải là số nguyên >= 1." },
      { status: 400 }
    );
  }

  // 3. Check for multi-field configuration vs legacy single-field
  const rawFields = formData.get("fields");
  const isMultiField = typeof rawFields === "string" && rawFields.trim().length > 0;

  const fields: ExtractionFieldConfig[] = [];
  let legacyTargetColumnConfig: TargetColumnConfig | null = null;
  let legacyCleanedSelectors: string[] = [];

  if (isMultiField) {
    let parsedFields: unknown;
    try {
      parsedFields = JSON.parse(rawFields as string);
    } catch {
      return NextResponse.json(
        { success: false, error: "Dữ liệu fields JSON không hợp lệ." },
        { status: 400 }
      );
    }

    if (!Array.isArray(parsedFields) || parsedFields.length === 0) {
      return NextResponse.json(
        { success: false, error: "Danh sách fields phải là mảng không rỗng." },
        { status: 400 }
      );
    }

    for (const f of parsedFields) {
      if (!f || typeof f !== "object") {
        return NextResponse.json(
          { success: false, error: "Cấu hình field không hợp lệ." },
          { status: 400 }
        );
      }

      const fId = String((f as { id?: unknown }).id || "").trim();
      const fName = String((f as { name?: unknown }).name || fId).trim();
      if (!fId) {
        return NextResponse.json(
          { success: false, error: "Mỗi field cần có trường 'id' hợp lệ." },
          { status: 400 }
        );
      }

      const rawSels = (f as { selectors?: unknown }).selectors;
      const cleaned = Array.isArray(rawSels)
        ? rawSels
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .map((s) => s.trim())
        : [];

      if (cleaned.length === 0) {
        return NextResponse.json(
          { success: false, error: `Field '${fName || fId}' cần ít nhất một selector hợp lệ.` },
          { status: 400 }
        );
      }

      const targetCol = (f as { targetColumn?: unknown }).targetColumn;
      if (!targetCol || typeof targetCol !== "object") {
        return NextResponse.json(
          { success: false, error: `Cấu hình cột đích của field '${fName}' không hợp lệ.` },
          { status: 400 }
        );
      }

      const mode = (targetCol as { mode?: unknown }).mode;
      let validTargetCol: TargetColumnConfig;
      if (mode === "existing") {
        const colIdx = (targetCol as { colIndex?: unknown }).colIndex;
        if (typeof colIdx !== "number" || isNaN(colIdx) || colIdx < 1) {
          return NextResponse.json(
            { success: false, error: `Field '${fName}': Cột đích (existing) yêu cầu colIndex >= 1.` },
            { status: 400 }
          );
        }
        validTargetCol = { mode: "existing", colIndex: colIdx };
      } else if (mode === "new") {
        const colNm = (targetCol as { colName?: unknown }).colName;
        if (typeof colNm !== "string" || colNm.trim().length === 0) {
          return NextResponse.json(
            { success: false, error: `Field '${fName}': Cột đích (new) yêu cầu colName không rỗng.` },
            { status: 400 }
          );
        }
        validTargetCol = { mode: "new", colName: colNm.trim() };
      } else {
        return NextResponse.json(
          { success: false, error: `Field '${fName}': Chế độ cột đích không hợp lệ (phải là 'existing' hoặc 'new').` },
          { status: 400 }
        );
      }

      fields.push({
        id: fId,
        name: fName,
        selectors: cleaned,
        targetColumn: validTargetCol,
      });
    }
  } else {
    // Validate legacy targetColumnConfig
    const rawTargetCol = formData.get("targetColumnConfig");
    if (!rawTargetCol || typeof rawTargetCol !== "string") {
      return NextResponse.json(
        { success: false, error: "Cấu hình cột đích bị thiếu." },
        { status: 400 }
      );
    }
    let targetColumnConfig: TargetColumnConfig;
    try {
      targetColumnConfig = JSON.parse(rawTargetCol);
    } catch {
      return NextResponse.json(
        { success: false, error: "Cấu hình cột đích JSON không hợp lệ." },
        { status: 400 }
      );
    }

    if (!targetColumnConfig || typeof targetColumnConfig !== "object") {
      return NextResponse.json(
        { success: false, error: "Cấu hình cột đích không hợp lệ." },
        { status: 400 }
      );
    }

    if (targetColumnConfig.mode === "existing") {
      if (
        typeof targetColumnConfig.colIndex !== "number" ||
        isNaN(targetColumnConfig.colIndex) ||
        targetColumnConfig.colIndex < 1
      ) {
        return NextResponse.json(
          { success: false, error: "Cột đích (existing) yêu cầu colIndex >= 1." },
          { status: 400 }
        );
      }
    } else if (targetColumnConfig.mode === "new") {
      if (
        typeof targetColumnConfig.colName !== "string" ||
        targetColumnConfig.colName.trim().length === 0
      ) {
        return NextResponse.json(
          { success: false, error: "Cột đích (new) yêu cầu colName không rỗng." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Chế độ cột đích không hợp lệ (phải là 'existing' hoặc 'new')." },
        { status: 400 }
      );
    }
    legacyTargetColumnConfig = targetColumnConfig;

    // Validate legacy selectors
    const rawSelectors = formData.get("selectors");
    if (!rawSelectors || typeof rawSelectors !== "string") {
      return NextResponse.json(
        { success: false, error: "Danh sách CSS selector bị thiếu." },
        { status: 400 }
      );
    }
    let selectors: unknown;
    try {
      selectors = JSON.parse(rawSelectors);
    } catch {
      return NextResponse.json(
        { success: false, error: "Danh sách CSS selector JSON không hợp lệ." },
        { status: 400 }
      );
    }

    if (!Array.isArray(selectors)) {
      return NextResponse.json(
        { success: false, error: "Danh sách CSS selector phải là mảng." },
        { status: 400 }
      );
    }

    legacyCleanedSelectors = selectors
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim());

    if (legacyCleanedSelectors.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cần ít nhất một CSS selector hợp lệ." },
        { status: 400 }
      );
    }
  }

  // 4. Parse optional sheetName and rowRange
  const rawSheetName = formData.get("sheetName");
  const sheetName =
    typeof rawSheetName === "string" && rawSheetName.trim().length > 0
      ? rawSheetName.trim()
      : "Sheet1";

  const rawRowRange = formData.get("rowRange");
  let rowRange: { startRow?: number; endRow?: number } | undefined;
  if (rawRowRange && typeof rawRowRange === "string" && rawRowRange.trim().length > 0) {
    try {
      rowRange = JSON.parse(rawRowRange);
    } catch {
      return NextResponse.json(
        { success: false, error: "Dữ liệu rowRange JSON không hợp lệ." },
        { status: 400 }
      );
    }
  }

  const rawSkipExisting = formData.get("skipExistingData");
  const skipExistingData = rawSkipExisting !== "false";

  const rawPreClick = formData.get("preClickSelector");
  const preClickSelector =
    typeof rawPreClick === "string" && rawPreClick.trim().length > 0
      ? rawPreClick.trim()
      : undefined;
  const scrapeOptions = preClickSelector ? { preClickSelector } : undefined;

  // 5. Inspect Excel workbook
  let originalBuffer: Buffer;
  try {
    const arrayBuffer = await (file as Blob).arrayBuffer();
    originalBuffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { success: false, error: "Không thể đọc dữ liệu tệp tải lên." },
      { status: 400 }
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(originalBuffer as unknown as ExcelJS.Buffer);
  } catch {
    return NextResponse.json(
      { success: false, error: "Tệp tải lên không phải là định dạng Excel hợp lệ." },
      { status: 400 }
    );
  }

  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    return NextResponse.json(
      { success: false, error: `Sheet '${sheetName}' không tồn tại trong file Excel.` },
      { status: 400 }
    );
  }

  // 6. Extract target rows
  const minRow = 2;
  const maxRow = worksheet.rowCount;

  const reqStart =
    typeof rowRange?.startRow === "number" && !isNaN(rowRange.startRow)
      ? rowRange.startRow
      : minRow;
  const reqEnd =
    typeof rowRange?.endRow === "number" && !isNaN(rowRange.endRow)
      ? rowRange.endRow
      : maxRow;

  const startRow = Math.max(minRow, reqStart);
  const endRow = Math.min(maxRow, reqEnd);

  interface RowTask {
    rowIndex: number;
    rawUrlValue: unknown;
  }

  const tasks: RowTask[] = [];
  if (startRow <= endRow && maxRow >= minRow) {
    for (let r = startRow; r <= endRow; r++) {
      const row = worksheet.getRow(r);
      const cell = row.getCell(urlColIndex);
      const urlVal = extractCellUrlValue(cell);
      tasks.push({ rowIndex: r, rawUrlValue: urlVal });
    }
  }

  const totalRows = tasks.length;
  const encoder = new TextEncoder();

  // 7. Create SSE Stream
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(name: string, data: unknown) {
        try {
          const payload = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream might be closed or cancelled
        }
      }

      // Periodic heartbeat to prevent proxies/gateways from dropping idle connections
      const pingInterval =
        process.env.NODE_ENV !== "test"
          ? setInterval(() => {
              try {
                controller.enqueue(encoder.encode(": ping\n\n"));
              } catch {
                if (pingInterval) clearInterval(pingInterval);
              }
            }, 15000)
          : null;

      sendEvent("start", { totalRows });

      const startTime = Date.now();
      let processedCount = 0;
      let succeededCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      const limit = pLimit(3);

      try {
        if (isMultiField) {
          const rowResults = new Map<number, Record<string, string>>();

          const promises = tasks.map((task) =>
            limit(async () => {
              if (req.signal.aborted) {
                return;
              }

              const rawStr =
                typeof task.rawUrlValue === "string"
                  ? task.rawUrlValue
                  : task.rawUrlValue !== null && task.rawUrlValue !== undefined
                  ? String(task.rawUrlValue)
                  : "";

              const validUrl = normalizeUrl(task.rawUrlValue);

              if (!validUrl) {
                skippedCount++;
                processedCount++;
                const progressPercent =
                  totalRows > 0 ? Math.round((processedCount / totalRows) * 100) : 100;
                const etaSeconds = calculateETA(startTime, processedCount, totalRows);

                const fieldResults: Record<string, FieldCrawlResult> = {};
                for (const f of fields) {
                  fieldResults[f.id] = { text: "", error: "URL trống hoặc không hợp lệ" };
                }

                sendEvent("row_progress", {
                  rowIndex: task.rowIndex,
                  url: rawStr,
                  status: "skipped",
                  fieldResults,
                  error: "URL trống hoặc không hợp lệ",
                  progressPercent,
                  processedCount,
                  totalCount: totalRows,
                  etaSeconds,
                });
                return;
              }

              // Check if target fields already have data
              const row = worksheet.getRow(task.rowIndex);
              const existingFieldValues: Record<string, string> = {};
              const fieldsToScrape: ExtractionFieldConfig[] = [];

              for (const f of fields) {
                if (
                  skipExistingData &&
                  f.targetColumn.mode === "existing" &&
                  isCellNonEmpty(row.getCell(f.targetColumn.colIndex))
                ) {
                  existingFieldValues[f.id] = getCellStringValue(
                    row.getCell(f.targetColumn.colIndex)
                  );
                } else {
                  fieldsToScrape.push(f);
                }
              }

              if (fieldsToScrape.length === 0) {
                skippedCount++;
                processedCount++;
                const progressPercent =
                  totalRows > 0 ? Math.round((processedCount / totalRows) * 100) : 100;
                const etaSeconds = calculateETA(startTime, processedCount, totalRows);

                const fieldResults: Record<string, FieldCrawlResult> = {};
                for (const f of fields) {
                  fieldResults[f.id] = {
                    text: existingFieldValues[f.id] || "",
                    matchedSelector: "(đã có dữ liệu)",
                  };
                }

                sendEvent("row_progress", {
                  rowIndex: task.rowIndex,
                  url: validUrl,
                  status: "skipped",
                  fieldResults,
                  text: Object.values(fieldResults).find((r) => r.text)?.text,
                  error: "Cột đích đã có dữ liệu (bỏ qua)",
                  progressPercent,
                  processedCount,
                  totalCount: totalRows,
                  etaSeconds,
                });
                return;
              }

              try {
                const scrapeResult = scrapeOptions
                  ? await scrapeMultiField(
                      validUrl,
                      fieldsToScrape.map((f) => ({ id: f.id, selectors: f.selectors })),
                      scrapeOptions
                    )
                  : await scrapeMultiField(
                      validUrl,
                      fieldsToScrape.map((f) => ({ id: f.id, selectors: f.selectors }))
                    );
                processedCount++;
                const progressPercent =
                  totalRows > 0 ? Math.round((processedCount / totalRows) * 100) : 100;
                const etaSeconds = calculateETA(startTime, processedCount, totalRows);

                const fieldResults: Record<string, FieldCrawlResult> = {};
                const extractedRowTexts: Record<string, string> = {};
                let hasMatch = false;

                for (const f of fields) {
                  if (existingFieldValues[f.id] !== undefined) {
                    fieldResults[f.id] = {
                      text: existingFieldValues[f.id],
                      matchedSelector: "(đã có dữ liệu)",
                    };
                  } else {
                    const match = scrapeResult[f.id];
                    if (match && match.text) {
                      hasMatch = true;
                      fieldResults[f.id] = {
                        text: match.text,
                        matchedSelector: match.matchedSelector,
                      };
                      extractedRowTexts[f.id] = match.text;
                    } else {
                      fieldResults[f.id] = {
                        text: "",
                        error: "Không tìm thấy selector nào khớp",
                      };
                    }
                  }
                }

                if (hasMatch) {
                  succeededCount++;
                  rowResults.set(task.rowIndex, extractedRowTexts);
                  sendEvent("row_progress", {
                    rowIndex: task.rowIndex,
                    url: validUrl,
                    status: "success",
                    fieldResults,
                    text: Object.values(fieldResults).find((r) => r.text)?.text,
                    matchedSelector: Object.values(fieldResults).find((r) => r.matchedSelector)?.matchedSelector,
                    progressPercent,
                    processedCount,
                    totalCount: totalRows,
                    etaSeconds,
                  });
                } else {
                  failedCount++;
                  sendEvent("row_progress", {
                    rowIndex: task.rowIndex,
                    url: validUrl,
                    status: "failed",
                    fieldResults,
                    error: "Không tìm thấy selector nào khớp",
                    progressPercent,
                    processedCount,
                    totalCount: totalRows,
                    etaSeconds,
                  });
                }
              } catch (crawlErr: unknown) {
                processedCount++;
                failedCount++;
                const progressPercent =
                  totalRows > 0 ? Math.round((processedCount / totalRows) * 100) : 100;
                const etaSeconds = calculateETA(startTime, processedCount, totalRows);
                const errMsg =
                  crawlErr instanceof Error ? crawlErr.message : "Lỗi cào dữ liệu";

                const fieldResults: Record<string, FieldCrawlResult> = {};
                for (const f of fields) {
                  if (existingFieldValues[f.id] !== undefined) {
                    fieldResults[f.id] = {
                      text: existingFieldValues[f.id],
                      matchedSelector: "(đã có dữ liệu)",
                    };
                  } else {
                    fieldResults[f.id] = { text: "", error: errMsg };
                  }
                }

                sendEvent("row_progress", {
                  rowIndex: task.rowIndex,
                  url: validUrl,
                  status: "failed",
                  fieldResults,
                  error: errMsg,
                  progressPercent,
                  processedCount,
                  totalCount: totalRows,
                  etaSeconds,
                });
              }
            })
          );

          await Promise.all(promises);

          if (req.signal.aborted) {
            return;
          }

          const enrichedBuffer = await enrichExcelBufferMultiField({
            buffer: originalBuffer,
            sheetName,
            fields,
            rowResults,
          });

          const rawFileName = (file as File).name || "excel.xlsx";
          const fileName = rawFileName.replace(/[\r\n"\\/:*?<>|]/g, "_");
          const originalName = fileName.replace(/\.[^/.]+$/, "") || "excel";
          const outputFilename = `${originalName}_updated.xlsx`;
          const downloadId = saveTempFile(enrichedBuffer, outputFilename);

          sendEvent("complete", {
            success: true,
            downloadId,
            filename: outputFilename,
            fileBase64: enrichedBuffer.toString("base64"),
            summary: {
              total: totalRows,
              succeeded: succeededCount,
              failed: failedCount,
              skipped: skippedCount,
              durationMs: Date.now() - startTime,
            },
          });
        } else {
          // Legacy single-field crawl flow
          const rowResults = new Map<number, string>();

          const promises = tasks.map((task) =>
            limit(async () => {
              if (req.signal.aborted) {
                return;
              }

              const rawStr =
                typeof task.rawUrlValue === "string"
                  ? task.rawUrlValue
                  : task.rawUrlValue !== null && task.rawUrlValue !== undefined
                  ? String(task.rawUrlValue)
                  : "";

              const validUrl = normalizeUrl(task.rawUrlValue);

              if (!validUrl) {
                skippedCount++;
                processedCount++;
                const progressPercent =
                  totalRows > 0 ? Math.round((processedCount / totalRows) * 100) : 100;
                const etaSeconds = calculateETA(startTime, processedCount, totalRows);
                sendEvent("row_progress", {
                  rowIndex: task.rowIndex,
                  url: rawStr,
                  status: "skipped",
                  error: "URL trống hoặc không hợp lệ",
                  progressPercent,
                  processedCount,
                  totalCount: totalRows,
                  etaSeconds,
                });
                return;
              }

              if (
                skipExistingData &&
                legacyTargetColumnConfig?.mode === "existing"
              ) {
                const row = worksheet.getRow(task.rowIndex);
                const targetCell = row.getCell(legacyTargetColumnConfig.colIndex);
                if (isCellNonEmpty(targetCell)) {
                  skippedCount++;
                  processedCount++;
                  const progressPercent =
                    totalRows > 0 ? Math.round((processedCount / totalRows) * 100) : 100;
                  const etaSeconds = calculateETA(startTime, processedCount, totalRows);
                  sendEvent("row_progress", {
                    rowIndex: task.rowIndex,
                    url: validUrl,
                    status: "skipped",
                    text: getCellStringValue(targetCell),
                    matchedSelector: "(đã có dữ liệu)",
                    error: "Cột đích đã có dữ liệu (bỏ qua)",
                    progressPercent,
                    processedCount,
                    totalCount: totalRows,
                    etaSeconds,
                  });
                  return;
                }
              }

              try {
                const match = scrapeOptions
                  ? await scrapeHybrid(validUrl, legacyCleanedSelectors, scrapeOptions)
                  : await scrapeHybrid(validUrl, legacyCleanedSelectors);
                processedCount++;
                const progressPercent =
                  totalRows > 0 ? Math.round((processedCount / totalRows) * 100) : 100;
                const etaSeconds = calculateETA(startTime, processedCount, totalRows);

                if (match && match.text) {
                  succeededCount++;
                  rowResults.set(task.rowIndex, match.text);
                  sendEvent("row_progress", {
                    rowIndex: task.rowIndex,
                    url: validUrl,
                    status: "success",
                    matchedSelector: match.selector,
                    text: match.text,
                    progressPercent,
                    processedCount,
                    totalCount: totalRows,
                    etaSeconds,
                  });
                } else {
                  failedCount++;
                  sendEvent("row_progress", {
                    rowIndex: task.rowIndex,
                    url: validUrl,
                    status: "failed",
                    error: "Không tìm thấy selector nào khớp",
                    progressPercent,
                    processedCount,
                    totalCount: totalRows,
                    etaSeconds,
                  });
                }
              } catch (crawlErr: unknown) {
                processedCount++;
                failedCount++;
                const progressPercent =
                  totalRows > 0 ? Math.round((processedCount / totalRows) * 100) : 100;
                const etaSeconds = calculateETA(startTime, processedCount, totalRows);
                const errMsg =
                  crawlErr instanceof Error ? crawlErr.message : "Lỗi cào dữ liệu";
                sendEvent("row_progress", {
                  rowIndex: task.rowIndex,
                  url: validUrl,
                  status: "failed",
                  error: errMsg,
                  progressPercent,
                  processedCount,
                  totalCount: totalRows,
                  etaSeconds,
                });
              }
            })
          );

          await Promise.all(promises);

          if (req.signal.aborted) {
            return;
          }

          const enrichedBuffer = await enrichExcelBuffer({
            buffer: originalBuffer,
            sheetName,
            targetColumn: legacyTargetColumnConfig!,
            rowResults,
          });

          const rawFileName = (file as File).name || "excel.xlsx";
          const fileName = rawFileName.replace(/[\r\n"\\/:*?<>|]/g, "_");
          const originalName = fileName.replace(/\.[^/.]+$/, "") || "excel";
          const outputFilename = `${originalName}_updated.xlsx`;
          const downloadId = saveTempFile(enrichedBuffer, outputFilename);

          sendEvent("complete", {
            success: true,
            downloadId,
            filename: outputFilename,
            fileBase64: enrichedBuffer.toString("base64"),
            summary: {
              total: totalRows,
              succeeded: succeededCount,
              failed: failedCount,
              skipped: skippedCount,
              durationMs: Date.now() - startTime,
            },
          });
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Lỗi hệ thống khi xử lý cào dữ liệu.";
        sendEvent("error", { message });
      } finally {
        if (pingInterval) {
          clearInterval(pingInterval);
        }
        try {
          controller.close();
        } catch {
          // Controller already closed
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
