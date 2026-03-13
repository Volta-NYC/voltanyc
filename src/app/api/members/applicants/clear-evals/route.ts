import { NextRequest, NextResponse } from "next/server";
import { dbRead, dbPatch, verifyCaller } from "@/lib/server/adminApi";

// One-shot cleanup: delete interviewEvaluations for specific applicants by name
// Also clears evaluationByUid on their linked slots
const NAMES_TO_CLEAR = ["aryan katakam", "sarah yagninim", "sarah umeed"];

function normName(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin", "project_lead"]);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const appsData = await dbRead("applications", verified.caller.idToken);
  const apps = (appsData ?? {}) as Record<string, Record<string, unknown>>;

  const results: string[] = [];
  const slotIdsToClear = new Set<string>();

  for (const [appId, row] of Object.entries(apps)) {
    const name = normName(row.fullName);
    if (!NAMES_TO_CLEAR.some((n) => name.includes(n) || n.includes(name))) continue;
    if (!row.interviewEvaluations) continue;

    await dbPatch(`applications/${appId}`, { interviewEvaluations: null }, verified.caller.idToken);
    results.push(`Cleared evals for ${String(row.fullName)} (${appId})`);

    // Collect linked slot ID so we can clear evaluationByUid there too
    const slotId = String(row.interviewSlotId ?? "").trim();
    if (slotId) slotIdsToClear.add(slotId);
  }

  // Also clear the interviewSlots side
  const slotsData = await dbRead("interviewSlots", verified.caller.idToken);
  const slots = (slotsData ?? {}) as Record<string, Record<string, unknown>>;
  for (const slotId of Array.from(slotIdsToClear)) {
    const slot = slots[slotId];
    if (!slot?.evaluationByUid) continue;
    await dbPatch(`interviewSlots/${slotId}`, { evaluationByUid: null }, verified.caller.idToken);
    results.push(`Cleared evaluationByUid on slot ${slotId}`);
  }

  return NextResponse.json({ success: true, results });
}
