import type { LudicordRequest } from "ludicord/server";
import { MAX_EXPORT_BYTES, storeExport } from "@/server/export-store";

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

export async function POST(request: LudicordRequest) {
  const userId = request.ludicord?.user.id;
  if (userId === undefined) return Response.json({ error: "Discord authorization is required." }, { status: 401 });

  if (request.headers.get("content-type")?.split(";", 1)[0] !== "image/png") {
    return Response.json({ error: "A PNG image is required." }, { status: 415 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!isPng(bytes)) return Response.json({ error: "The export is not a valid PNG image." }, { status: 400 });
  if (bytes.byteLength > MAX_EXPORT_BYTES) {
    return Response.json({ error: "The export is too large. Reduce the number of image items and try again." }, { status: 413 });
  }

  const token = storeExport(userId, bytes);
  return Response.json({ path: `/api/export/${token}` });
}
