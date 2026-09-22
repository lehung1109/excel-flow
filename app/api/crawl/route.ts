import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import pLimit from "p-limit";
import { enrichExcelBuffer } from "@/lib/excel-service";
import { scrapeHybrid } from "@/lib/scraper";
import { saveTempFile } from "@/lib/temp-store";
import { calculateETA, normalizeUrl } from "@/lib/url-utils";
import type { TargetColumnConfig } from "@/types/crawler";

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

  // 3. Validate targetColumnConfig
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

  // 4. Validate selectors
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

  const cleanedSelectors = selectors
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());

  if (cleanedSelectors.length === 0) {
    return NextResponse.json(
      { success: false, error: "Cần ít nhất một CSS selector hợp lệ." },
      { status: 400 }
    );
  }

  // 5. Parse optional sheetName and rowRange
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

  // 6. Inspect Excel workbook
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

  // 7. Extract target rows
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

  // 8. Create SSE Stream
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

      sendEvent("start", { totalRows });

      const startTime = Date.now();
      let processedCount = 0;
      let succeededCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      const rowResults = new Map<number, string>();
      const limit = pLimit(3);

      try {
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

            try {
              const match = await scrapeHybrid(validUrl, cleanedSelectors);
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

        // Enrich Excel buffer
        const enrichedBuffer = await enrichExcelBuffer({
          buffer: originalBuffer,
          sheetName,
          targetColumn: targetColumnConfig,
          rowResults,
        });

        const fileName = (file as File).name || "excel.xlsx";
        const originalName = fileName.replace(/\.[^/.]+$/, "") || "excel";
        const outputFilename = `${originalName}_updated.xlsx`;
        const downloadId = saveTempFile(enrichedBuffer, outputFilename);

        sendEvent("complete", {
          success: true,
          downloadId,
          summary: {
            total: totalRows,
            succeeded: succeededCount,
            failed: failedCount,
            skipped: skippedCount,
            durationMs: Date.now() - startTime,
          },
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Lỗi hệ thống khi xử lý cào dữ liệu.";
        sendEvent("error", { message });
      } finally {
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
