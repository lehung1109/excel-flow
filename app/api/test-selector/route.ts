import { NextRequest, NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/url-utils";
import { scrapeHybrid, scrapeMultiField } from "@/lib/scraper";
import type { FieldCrawlResult } from "@/types/crawler";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Dữ liệu JSON không hợp lệ." },
        { status: 400 }
      );
    }

    const typedBody = body as {
      url?: unknown;
      selectors?: unknown;
      fields?: unknown;
    } | null | undefined;

    // Multi-field mode if fields is provided
    if (typedBody?.fields !== undefined) {
      const rawFields = typedBody.fields;
      if (!Array.isArray(rawFields) || rawFields.length === 0) {
        return NextResponse.json(
          { success: false, error: "Danh sách field phải là một mảng không rỗng." },
          { status: 400 }
        );
      }

      const validUrl = normalizeUrl(typedBody?.url);
      if (!validUrl) {
        return NextResponse.json(
          { success: false, error: "URL không hợp lệ hoặc bị thiếu." },
          { status: 400 }
        );
      }

      const fields: Array<{ id: string; selectors: string[] }> = [];
      for (const f of rawFields) {
        if (!f || typeof f !== "object") {
          return NextResponse.json(
            { success: false, error: "Cấu hình field không hợp lệ." },
            { status: 400 }
          );
        }
        const fId = String((f as { id?: unknown }).id || "").trim();
        if (!fId) {
          return NextResponse.json(
            { success: false, error: "Mỗi field phải có trường 'id' không rỗng." },
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
            { success: false, error: `Field '${fId || "chưa đặt tên"}' cần ít nhất một selector hợp lệ.` },
            { status: 400 }
          );
        }

        fields.push({ id: fId, selectors: cleaned });
      }

      const multiResults = await scrapeMultiField(validUrl, fields);
      const results: Record<string, FieldCrawlResult> = {};

      for (const f of fields) {
        const match = multiResults[f.id];
        if (match && match.text) {
          results[f.id] = {
            text: match.text,
            matchedSelector: match.matchedSelector,
          };
        } else {
          results[f.id] = {
            text: "",
            error: "Không tìm thấy nội dung nào khớp",
          };
        }
      }

      return NextResponse.json({ success: true, results }, { status: 200 });
    }

    // Legacy single-field mode
    const rawSelectors = typedBody?.selectors;
    if (!Array.isArray(rawSelectors)) {
      return NextResponse.json(
        { success: false, error: "Danh sách selector phải là một mảng." },
        { status: 400 }
      );
    }

    const selectors = rawSelectors
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim());

    if (selectors.length === 0) {
      return NextResponse.json(
        { success: false, error: "Vui lòng cung cấp ít nhất một selector hợp lệ." },
        { status: 400 }
      );
    }

    const validUrl = normalizeUrl(typedBody?.url);
    if (!validUrl) {
      return NextResponse.json(
        { success: false, error: "URL không hợp lệ hoặc bị thiếu." },
        { status: 400 }
      );
    }

    const match = await scrapeHybrid(validUrl, selectors);

    if (!match) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Không tìm thấy nội dung nào khớp với danh sách selector trên trang web này.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        matchedSelector: match.selector,
        textContent: match.text,
        method: match.method,
        durationMs: match.durationMs,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[POST /api/test-selector] Lỗi:", err);
    const message = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
