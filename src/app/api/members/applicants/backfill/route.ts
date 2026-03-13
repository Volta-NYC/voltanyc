import { NextResponse } from "next/server";
import { dbRead, dbPatch } from "@/lib/server/adminApi";

function normalizeName(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesLikelyMatch(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  return false;
}

export async function GET() {
  try {
    const appsData = await dbRead("applications");
    const appsMap = (appsData || {}) as Record<string, Record<string, unknown>>;

    const targets = [
      {
        name: "Marcus A Pena Herrera",
        notes: "Marcus A Pena Herrera - ✅\nLooks like a strong coder, easy to talk with, willing to adapt to schedule, should be let in",
        status: "Interview Completed",
      },
      {
        name: "Sophia Chang",
        notes: "Sophia Chang -  ✅+\nMarketing plus finances- aspirations of being a Econ major and does photoshop for a hobby which would be very useful - would accept to both with maybe a higher role in marketing as it seems more useful",
        status: "Interview Completed",
      },
      {
        name: "Sanari Hossain",
        notes: "Sanari Hossain - ⏹️\nMarketing- has had past social media experience- edits videos based in past along with leadership seems like a good fit however; very timid when speaking and not very elaborative, could be an empty person in a group or a team leader it’s your call",
        status: "Interview Completed",
      },
      {
        name: "Vivian Hoelscher",
        notes: "Vivian Hoelscher \nDigital & Tech - Interested in CS, willing to learn. Has experience in Netlogo, Python, and the Linux/Unix shell & takes very advanced coursework. Speaks clearly and easy to talk to",
        status: "Interview Completed",
      }
    ];

    const results: string[] = [];

    for (const target of targets) {
      // Find matching applicant
      let matchedId: string | null = null;
      let matchedName = "";
      
      for (const [id, row] of Object.entries(appsMap)) {
        const rowName = String(row.fullName || row["Full Name"] || row.name || "");
        if (namesLikelyMatch(rowName, target.name)) {
          matchedId = id;
          matchedName = rowName;
          break;
        }
      }

      if (matchedId) {
        await dbPatch(`applications/${matchedId}`, {
          notes: target.notes,
          status: target.status,
          updatedAt: new Date().toISOString()
        });
        results.push(`Updated ${matchedName} (${matchedId})`);
      } else {
        results.push(`Could NOT find matching applicant for: ${target.name}`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
