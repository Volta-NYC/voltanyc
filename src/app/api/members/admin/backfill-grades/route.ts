import { NextRequest, NextResponse } from "next/server";
import { verifyCaller } from "@/lib/server/adminApi";
import { getAdminDB } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin"]);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const db = getAdminDB();
  if (!db) return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });

  const teamSnap = await db.ref("team").get();
  const team = teamSnap.val() || {};

  const appsSnap = await db.ref("applications").get();
  const apps = appsSnap.val() || {};

  let patched = 0;

  for (const [teamId, memberRaw] of Object.entries(team)) {
    const member = memberRaw as Record<string, unknown>;
    const memberGrade = String(member.grade || "");
    if (memberGrade && memberGrade.trim() !== "") continue;

    const email = String(member.email || "").trim().toLowerCase();
    const alt = String(member.alternateEmail || "").trim().toLowerCase();
    let grade = "";

    // 1. match by email
    for (const appRaw of Object.values(apps)) {
      const app = appRaw as Record<string, unknown>;
      const appEmail = String(app.email || "").trim().toLowerCase();
      if ((email && appEmail === email) || (alt && appEmail === alt)) {
        const appGrade = String(app.grade || "");
        if (appGrade && appGrade.trim() !== "") {
          grade = appGrade.trim();
          break;
        }
      }
    }

    // 2. match by name
    if (!grade) {
      for (const appRaw of Object.values(apps)) {
        const app = appRaw as Record<string, unknown>;
        const appName = String(app.fullName || "");
        const memberName = String(member.name || "");
        
        if (appName && memberName && appName.trim().toLowerCase() === memberName.trim().toLowerCase()) {
          const appGrade = String(app.grade || "");
          if (appGrade && appGrade.trim() !== "") {
            grade = appGrade.trim();
            break;
          }
        }
      }
    }

    if (grade) {
      await db.ref(`team/${teamId}`).update({ grade });
      patched++;
    }
  }

  return NextResponse.json({ success: true, patched });
}
