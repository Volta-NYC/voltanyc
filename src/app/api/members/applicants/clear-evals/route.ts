import { NextRequest, NextResponse } from "next/server";
import { dbRead, dbPatch, verifyCaller } from "@/lib/server/adminApi";

// Delete Ethan Zhang's evaluation entries from specific applicants (Sarah / Aryan legacy duplicates)
const NAMES_TO_CLEAR = ["aryan katakam", "sarah"];
const EVALUATOR_NAME = "ethan zhang";

function normName(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin", "project_lead"]);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const appsData = await dbRead("applications", verified.caller.idToken);
  const apps = (appsData ?? {}) as Record<string, Record<string, unknown>>;

  const results: string[] = [];
  const slotIdsToClear: string[] = [];

  for (const [appId, row] of Object.entries(apps)) {
    const name = normName(row.fullName);
    if (!NAMES_TO_CLEAR.some((n) => name.includes(n) || n.includes(name))) continue;

    const evals = row.interviewEvaluations as Record<string, Record<string, unknown>> | undefined;
    if (!evals || typeof evals !== "object") continue;

    // Find and remove Ethan Zhang's eval entry specifically
    for (const [uid, evalEntry] of Object.entries(evals)) {
      const evaluatorName = normName(evalEntry?.interviewerName);
      const evaluatorEmail = normName(evalEntry?.interviewerEmail);
      if (evaluatorName.includes(EVALUATOR_NAME) || evaluatorEmail.includes("ethan")) {
        await dbPatch(`applications/${appId}`, {
          [`interviewEvaluations/${uid}`]: null
        }, verified.caller.idToken);
        results.push(`Deleted eval by ${String(evalEntry?.interviewerName)} for ${String(row.fullName)} (${appId})`);
      }
    }

    const slotId = String(row.interviewSlotId ?? "").trim();
    if (slotId) slotIdsToClear.push(slotId);
  }

  // Also clear the evaluationByUid on linked slots
  const slotsData = await dbRead("interviewSlots", verified.caller.idToken);
  const slots = (slotsData ?? {}) as Record<string, Record<string, unknown>>;
  for (const slotId of slotIdsToClear) {
    const slot = slots[slotId];
    const evalByUid = slot?.evaluationByUid as Record<string, Record<string, unknown>> | undefined;
    if (!evalByUid || typeof evalByUid !== "object") continue;
    for (const [uid, evalEntry] of Object.entries(evalByUid)) {
      const evaluatorName = normName(evalEntry?.interviewerName);
      const evaluatorEmail = normName(evalEntry?.interviewerEmail);
      if (evaluatorName.includes(EVALUATOR_NAME) || evaluatorEmail.includes("ethan")) {
        await dbPatch(`interviewSlots/${slotId}`, {
          [`evaluationByUid/${uid}`]: null
        }, verified.caller.idToken);
        results.push(`Deleted evaluationByUid/${uid} on slot ${slotId}`);
      }
    }
  }

  return NextResponse.json({ success: true, results });
}
