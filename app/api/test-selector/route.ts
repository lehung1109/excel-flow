import { NextRequest, NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/url-utils";
import { scrapeHybrid } from "@/lib/scraper";

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

    const typedBody = body as { url?: unknown; selectors?: unknown } | null | undefined;

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
    const message = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
