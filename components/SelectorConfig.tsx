"use client";

import React, { useEffect, useState } from "react";
import { Sliders, Plus, Trash2, Sparkles } from "lucide-react";
import type { ExcelColumnInfo, TargetColumnConfig } from "@/types/crawler";

export interface SelectorConfigProps {
  columns: ExcelColumnInfo[];
  totalRows: number;
  urlColIndex: number | null;
  onUrlColChange: (idx: number) => void;
  selectors: string[];
  onSelectorsChange: (selectors: string[]) => void;
  targetConfig: TargetColumnConfig;
  onTargetConfigChange: (config: TargetColumnConfig) => void;
  rowRange: { startRow: number; endRow: number };
  onRowRangeChange: (range: { startRow: number; endRow: number }) => void;
  onTestRequested: () => void;
}

const PRESETS = [
  {
    label: "Tiêu đề",
    selectors: [
      "h1.product-title",
      "h1.entry-title",
      "h1",
      ".title",
      "[itemprop='headline']",
    ],
  },
  {
    label: "Giá",
    selectors: [".price", ".product-price", "[data-price]", "span.price"],
  },
  {
    label: "Mô tả",
    selectors: ["article p", ".description", ".post-content p", "main p"],
  },
];

const STORAGE_KEY = "excel_flow_saved_selectors";

export default function SelectorConfig({
  columns,
  totalRows,
  urlColIndex,
  onUrlColChange,
  selectors,
  onSelectorsChange,
  targetConfig,
  onTargetConfigChange,
  rowRange,
  onRowRangeChange,
  onTestRequested,
}: SelectorConfigProps) {
  const [newSelectorInput, setNewSelectorInput] = useState("");
  const [customRangeEnabled, setCustomRangeEnabled] = useState(false);

  // Load saved selectors from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            onSelectorsChange(parsed);
          }
        }
      }
    } catch {
      // ignore JSON or storage errors
    }
  }, []);

  function updateSelectorsAndSave(newList: string[]) {
    onSelectorsChange(newList);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      }
    } catch {
      // ignore storage errors
    }
  }

  function handleAddSelector() {
    const trimmed = newSelectorInput.trim();
    if (trimmed && !selectors.includes(trimmed)) {
      const next = [...selectors, trimmed];
      updateSelectorsAndSave(next);
      setNewSelectorInput("");
    }
  }

  function handleRemoveSelector(index: number) {
    const next = selectors.filter((_, idx) => idx !== index);
    updateSelectorsAndSave(next);
  }

  function applyPreset(presetSelectors: string[]) {
    updateSelectorsAndSave(presetSelectors);
  }

  const effectiveTotalRows = Math.max(0, totalRows > 1 ? totalRows - 1 : 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <Sliders className="w-5 h-5 text-indigo-600" />
        Bước 2: Cấu hình trích xuất dữ liệu
      </h2>

      {/* URL Column & Target Column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* URL Column selection */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
            1. Chọn Cột chứa URL <span className="text-rose-500">*</span>
          </label>
          <select
            value={urlColIndex || ""}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) {
                onUrlColChange(val);
              }
            }}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">-- Bấm để chọn cột URL --</option>
            {columns.map((c) => (
              <option key={c.index} value={c.index}>
                Cột {c.index}: {c.header}
              </option>
            ))}
          </select>
        </div>

        {/* Target Column selection */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
            2. Cột Đích để điền dữ liệu <span className="text-rose-500">*</span>
          </label>

          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() =>
                onTargetConfigChange({
                  mode: "new",
                  colName: targetConfig.mode === "new" ? targetConfig.colName : "Extracted_Content",
                })
              }
              className={`px-3 py-1 text-xs rounded-full font-medium transition ${
                targetConfig.mode === "new"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              + Tạo cột mới ở cuối bảng
            </button>
            <button
              type="button"
              onClick={() =>
                onTargetConfigChange({
                  mode: "existing",
                  colIndex: targetConfig.mode === "existing" ? targetConfig.colIndex : (columns[0]?.index || 1),
                })
              }
              className={`px-3 py-1 text-xs rounded-full font-medium transition ${
                targetConfig.mode === "existing"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Ghi vào cột đã có
            </button>
          </div>

          {targetConfig.mode === "new" ? (
            <input
              type="text"
              placeholder="Nhập tên tiêu đề cột mới (vd: Noi_Dung_Cao)"
              value={targetConfig.colName}
              onChange={(e) =>
                onTargetConfigChange({ mode: "new", colName: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          ) : (
            <select
              value={targetConfig.colIndex}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  onTargetConfigChange({
                    mode: "existing",
                    colIndex: val,
                  });
                }
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {columns.map((c) => (
                <option key={c.index} value={c.index}>
                  Ghi đè Cột {c.index}: {c.header}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Selectors List */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold uppercase text-slate-600 flex items-center gap-1">
            3. Danh sách CSS Selector (Fallback theo thứ tự ưu tiên từ trên xuống)
            <span className="text-rose-500">*</span>
          </label>
          <span className="text-xs text-slate-400">Thử lần lượt, lấy text của selector đầu tiên khớp</span>
        </div>

        {/* Preset quick buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Mẫu nhanh:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.selectors)}
              className="px-2.5 py-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-100 transition cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Add selector input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Nhập selector mới (ví dụ: h1.title, .product-price, #main-heading)..."
            value={newSelectorInput}
            onChange={(e) => setNewSelectorInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddSelector();
              }
            }}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleAddSelector}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Thêm
          </button>
        </div>

        {/* List of active selectors */}
        {selectors.length === 0 ? (
          <p className="text-xs text-amber-600 italic">Chưa có selector nào. Vui lòng thêm ít nhất 1 selector.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {selectors.map((sel, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-5 h-5 flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold rounded-full text-[10px] shrink-0">
                    {idx + 1}
                  </span>
                  <code className="font-mono text-slate-800 truncate">{sel}</code>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSelector(idx)}
                  className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer shrink-0"
                  title="Xóa selector này"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row range selection for large files */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-slate-700">Phạm vi dòng cần cào:</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="rangeType"
                checked={!customRangeEnabled}
                onChange={() => {
                  setCustomRangeEnabled(false);
                  onRowRangeChange({ startRow: 2, endRow: Math.max(2, totalRows) });
                }}
              />
              <span>Toàn bộ file ({effectiveTotalRows} dòng)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="rangeType"
                checked={customRangeEnabled}
                onChange={() => setCustomRangeEnabled(true)}
              />
              <span>Chọn khoảng dòng</span>
            </label>
          </div>
        </div>

        {customRangeEnabled && (
          <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-200">
            <span>Từ dòng:</span>
            <input
              type="number"
              min={2}
              max={totalRows}
              value={rowRange.startRow}
              onChange={(e) =>
                onRowRangeChange({
                  ...rowRange,
                  startRow: Math.max(2, parseInt(e.target.value, 10) || 2),
                })
              }
              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded text-center text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span>Đến dòng:</span>
            <input
              type="number"
              min={rowRange.startRow}
              max={totalRows}
              value={rowRange.endRow}
              onChange={(e) =>
                onRowRangeChange({
                  ...rowRange,
                  endRow: Math.min(totalRows, parseInt(e.target.value, 10) || totalRows),
                })
              }
              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded text-center text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-slate-400">
              (Tổng: {Math.max(0, rowRange.endRow - rowRange.startRow + 1)} dòng)
            </span>
          </div>
        )}
      </div>

      {/* Test 1 URL button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onTestRequested}
          className="px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 flex items-center gap-1.5 transition cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          Test thử selector trên 1 URL mẫu
        </button>
      </div>
    </div>
  );
}
