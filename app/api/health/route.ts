export const auth = false;

export function GET() {
  return Response.json({ status: "ok", storage: "ephemeral" });
}