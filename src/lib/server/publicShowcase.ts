import "server-only";

import { getAdminDB } from "@/lib/firebaseAdmin";

export type PublicShowcaseStatus = "In Progress" | "Active" | "Upcoming";
export type PublicShowcaseColor = "green" | "blue" | "orange" | "amber" | "pink" | "purple";

export interface PublicShowcaseCard {
  id: string;
  name: string;
  type: string;
  neighborhood: string;
  services: string[];
  status: PublicShowcaseStatus;
  color: PublicShowcaseColor;
  desc: string;
  url?: string;
  featuredOnHome: boolean;
  order: number;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeColor(value: unknown): PublicShowcaseColor {
  const key = asText(value).toLowerCase();
  if (key === "green" || key === "blue" || key === "orange" || key === "amber" || key === "pink" || key === "purple") {
    return key;
  }
  return "green";
}

function defaultColorFromDivision(value: unknown): PublicShowcaseColor {
  const key = asText(value);
  if (key === "Tech") return "blue";
  if (key === "Finance") return "amber";
  return "green";
}

function normalizeStatusFromShowcase(value: unknown): PublicShowcaseStatus | null {
  const key = asText(value);
  if (key === "In Progress" || key === "Active" || key === "Upcoming") return key;
  return null;
}

function mapBusinessStatusToShowcase(value: unknown): PublicShowcaseStatus {
  const key = asText(value);
  if (key === "Active" || key === "Complete") return "Active";
  if (key === "Not Started" || key === "Discovery" || key === "On Hold") return "Upcoming";
  return "In Progress";
}

function defaultServicesFromDivision(value: unknown): string[] {
  const key = asText(value);
  if (key === "Tech") return ["Website", "SEO"];
  if (key === "Marketing") return ["Social Media", "Brand Strategy"];
  if (key === "Finance") return ["Grant Writing", "Operations"];
  return ["Business Support"];
}

function normalizeDescription(value: unknown, fallback: string): string {
  const text = asText(value) || fallback;
  if (!text) return "Client project supported by Volta student teams.";
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function compareCards(a: PublicShowcaseCard, b: PublicShowcaseCard): number {
  const orderDiff = a.order - b.order;
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name);
}

export async function getPublicShowcaseCards(): Promise<PublicShowcaseCard[]> {
  const db = getAdminDB();
  if (!db) return [];

  const snap = await db.ref("businesses").get();
  if (!snap.exists()) return [];

  const rows = snap.val() as Record<string, Record<string, unknown>>;
  const explicitCards: PublicShowcaseCard[] = [];
  const fallbackCards: PublicShowcaseCard[] = [];

  for (const [id, row] of Object.entries(rows)) {
    const name = asText(row.showcaseName) || asText(row.name);
    if (!name) continue;

    const type = asText(row.showcaseType) || asText(row.division) || "Small Business";
    const neighborhood = asText(row.showcaseNeighborhood) || "New York City";
    const services = asStringArray(row.showcaseServices);
    const mergedServices = services.length > 0 ? services : defaultServicesFromDivision(row.division);
    const status = normalizeStatusFromShowcase(row.showcaseStatus) ?? mapBusinessStatusToShowcase(row.projectStatus);
    const desc = normalizeDescription(row.showcaseDescription, asText(row.notes));
    const url = asText(row.showcaseUrl) || asText(row.website) || "";
    const color = asText(row.showcaseColor)
      ? normalizeColor(row.showcaseColor)
      : defaultColorFromDivision(row.division);
    const order = asNumber(row.showcaseOrder, 9999);
    const featuredOnHome = asBool(row.showcaseFeaturedOnHome, status !== "Upcoming");

    const card: PublicShowcaseCard = {
      id,
      name,
      type,
      neighborhood,
      services: mergedServices,
      status,
      color,
      desc,
      url: url || undefined,
      featuredOnHome,
      order,
    };

    if (asBool(row.showcaseEnabled, false)) {
      explicitCards.push(card);
    } else {
      fallbackCards.push(card);
    }
  }

  if (explicitCards.length > 0) {
    return explicitCards.sort(compareCards);
  }

  return fallbackCards
    .filter((card) => card.status !== "Upcoming")
    .sort(compareCards)
    .slice(0, 12);
}
