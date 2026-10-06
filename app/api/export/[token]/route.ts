import type { LudicordRequest } from "ludicord/server";
import { getExport } from "@/server/export-store";

export const auth = false;

export function GET(request: LudicordRequest) {
  const bytes = getExport(request.params.token);
  if (bytes === null) {
    return new Response("This export has expired. Return to Tier Together and export it again.", {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  return new Response(bytes.slice().buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'attachment; filename="tier-together-result.png"',
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
