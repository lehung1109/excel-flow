"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Download } from "lucide-react";
import type { ExcelColumnInfo, ExcelSheetSummary } from "@/types/crawler";

export interface FileUploadZoneProps {
  onFileLoaded: (file: File, summaries: ExcelSheetSummary[]) => void;
  selectedSheet: string;
  onSheetChange: (sheetName: string) => void;
}

function extractCellValue(cell: any): string | number | null {
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
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText.map((t: any) => t.text ?? "").join("");
    }
    if ("text" in val && typeof val.text === "string") {
      return val.text;
    }
    if ("result" in val && val.result !== undefined && val.result !== null) {
      const res = val.result;
      if (typeof res === "number") return res;
      if (typeof res === "string") return res;
      return String(res);
    }
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

export default function FileUploadZone({
  onFileLoaded,
  selectedSheet,
  onSheetChange,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ExcelSheetSummary[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError("Vui lòng tải lên file định dạng Excel (.xlsx hoặc .xls)");
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setError("File quá lớn (> 30MB). Vui lòng tải file dung lượng nhỏ hơn.");
      return;
    }

    setError(null);
    setLoading(true);
    setFileName(file.name);
    setFileSize((file.size / (1024 * 1024)).toFixed(2) + " MB");

    try {
      // Dynamic import exceljs on client for quick client-side preview
      const ExcelJSModule = await import("exceljs");
      const ExcelJS = (ExcelJSModule as any).default || ExcelJSModule;
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const summaries: ExcelSheetSummary[] = [];
      workbook.eachSheet((worksheet: any) => {
        const columns: ExcelColumnInfo[] = [];
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
          let headerText = "";
          if (cell.text && typeof cell.text === "string") {
            headerText = cell.text.trim();
          } else if (cell.value !== null && cell.value !== undefined) {
            headerText = String(cell.value).trim();
          }
          columns.push({
            index: colNumber,
            header: headerText || `Cột ${colNumber}`,
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

      setSheets(summaries);
      if (summaries.length > 0) {
        onSheetChange(summaries[0].name);
      }
      onFileLoaded(file, summaries);
    } catch (err: any) {
      setError("Không thể đọc file Excel. Vui lòng kiểm tra lại định dạng file.");
    } finally {
      setLoading(false);
    }
  }

  const activeSheet = sheets.find((s) => s.name === selectedSheet) || sheets[0];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          Bước 1: Tải lên file Excel
        </h2>
        <a
          href="/demo_sample.xlsx"
          download="demo_sample.xlsx"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium transition self-start sm:self-auto"
          title="Tải file Excel có sẵn dữ liệu và URL mẫu để test ngay"
        >
          <Download className="w-3.5 h-3.5" />
          Tải file Excel mẫu (.xlsx)
        </a>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.[0]) {
            handleFile(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-emerald-500 bg-emerald-50/50"
            : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
            <UploadCloud className="w-7 h-7" />
          </div>
          <div>
            <p className="font-medium text-slate-700">
              Kéo thả file Excel vào đây hoặc <span className="text-emerald-600 underline">bấm để chọn</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">Hỗ trợ định dạng .xlsx, .xls (Tối đa 30MB)</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-4 p-4 text-center text-sm text-slate-600 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span>Đang đọc và phân tích cấu trúc file Excel...</span>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {fileName && !loading && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate max-w-xs">{fileName}</span>
              <span className="text-xs text-slate-400">({fileSize})</span>
            </div>

            {sheets.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Sheet:</span>
                <select
                  value={selectedSheet}
                  onChange={(e) => onSheetChange(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.rowCount} dòng)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {activeSheet && activeSheet.columns.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500 mb-2">
                Xem trước 5 dòng đầu ({activeSheet.columns.length} cột, {Math.max(0, activeSheet.rowCount - 1)} dòng dữ liệu):
              </p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-48 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold sticky top-0">
                      {activeSheet.columns.map((col) => (
                        <th key={col.index} className="p-2 border-r border-slate-200 whitespace-nowrap">
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSheet.sampleRows.length > 0 ? (
                      activeSheet.sampleRows.map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-2 border-r border-slate-100 max-w-xs truncate text-slate-600">
                              {cell !== null ? String(cell) : <span className="text-slate-300 italic">trống</span>}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr className="border-b border-slate-100">
                        <td colSpan={activeSheet.columns.length} className="p-4 text-center text-slate-400 italic">
                          Không có dữ liệu dòng nào
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
