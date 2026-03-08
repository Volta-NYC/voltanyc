import { getAdminDB } from "@/lib/firebaseAdmin";

type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

type RateLimitOptions = {
  bucket: string;
  key: string;
  limit: number;
  windowSec: number;
};

type LimitRecord = {
  count?: number;
  resetAt?: number;
  blocked?: boolean;
  lastSeenAt?: number;
};

const memoryStore = new Map<string, LimitRecord>();

function normalizeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function safePathSegment(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 160);
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  return "unknown";
}

function computeResult(record: LimitRecord, limit: number, now: number): RateLimitResult {
  const resetAt = typeof record.resetAt === "number" ? record.resetAt : now;
  const count = typeof record.count === "number" ? record.count : 0;
  const blocked = record.blocked === true;
  const ok = !blocked && count <= limit;
  const remaining = blocked ? 0 : Math.max(0, limit - count);
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
  return { ok, limit, remaining, resetAt, retryAfterSec };
}

export async function consumeRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  const limit = normalizeInt(opts.limit, 5);
  const windowSec = normalizeInt(opts.windowSec, 3600);
  const windowMs = windowSec * 1000;

  const bucket = safePathSegment(opts.bucket);
  const key = safePathSegment(opts.key);
  const storeKey = `${bucket}:${key}`;

  const adminDb = getAdminDB();
  if (!adminDb) {
    const current = memoryStore.get(storeKey);
    let next: LimitRecord;

    if (!current || !current.resetAt || current.resetAt <= now) {
      next = { count: 1, resetAt: now + windowMs, blocked: false, lastSeenAt: now };
    } else if ((current.count ?? 0) >= limit) {
      next = { ...current, blocked: true, lastSeenAt: now };
    } else {
      next = { ...current, count: (current.count ?? 0) + 1, blocked: false, lastSeenAt: now };
    }

    memoryStore.set(storeKey, next);
    return computeResult(next, limit, now);
  }

  const ref = adminDb.ref(`abuseGuards/${bucket}/${key}`);
  const tx = await ref.transaction((raw) => {
    const current = (raw ?? {}) as LimitRecord;
    const count = typeof current.count === "number" ? current.count : 0;
    const resetAt = typeof current.resetAt === "number" ? current.resetAt : 0;

    if (!resetAt || resetAt <= now) {
      return { count: 1, resetAt: now + windowMs, blocked: false, lastSeenAt: now };
    }

    if (count >= limit) {
      return { ...current, blocked: true, lastSeenAt: now };
    }

    return { ...current, count: count + 1, blocked: false, lastSeenAt: now };
  });

  const value = (tx.snapshot.val() ?? {}) as LimitRecord;
  return computeResult(value, limit, now);
}
