import { randomBytes } from "node:crypto";

interface StoredExport {
  readonly userId: string;
  readonly bytes: Uint8Array;
  readonly expiresAt: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

const exportsByToken = new Map<string, StoredExport>();
const tokenByUserId = new Map<string, string>();
const EXPORT_TTL_MS = 5 * 60_000;
const MAX_EXPORTS = 16;
export const MAX_EXPORT_BYTES = 4 * 1024 * 1024;

function removeExport(token: string): void {
  const stored = exportsByToken.get(token);
  if (stored === undefined) return;
  clearTimeout(stored.timer);
  exportsByToken.delete(token);
  if (tokenByUserId.get(stored.userId) === token) tokenByUserId.delete(stored.userId);
}

export function storeExport(userId: string, bytes: Uint8Array): string {
  const previousToken = tokenByUserId.get(userId);
  if (previousToken !== undefined) removeExport(previousToken);

  while (exportsByToken.size >= MAX_EXPORTS) {
    const oldestToken = exportsByToken.keys().next().value as string | undefined;
    if (oldestToken === undefined) break;
    removeExport(oldestToken);
  }

  const token = randomBytes(24).toString("base64url");
  const timer = setTimeout(() => removeExport(token), EXPORT_TTL_MS);
  timer.unref?.();
  exportsByToken.set(token, {
    userId,
    bytes: Uint8Array.from(bytes),
    expiresAt: Date.now() + EXPORT_TTL_MS,
    timer,
  });
  tokenByUserId.set(userId, token);
  return token;
}

export function getExport(token: string): Uint8Array | null {
  const stored = exportsByToken.get(token);
  if (stored === undefined) return null;
  if (stored.expiresAt <= Date.now()) {
    removeExport(token);
    return null;
  }
  return stored.bytes;
}
