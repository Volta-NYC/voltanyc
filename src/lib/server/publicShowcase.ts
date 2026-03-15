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
  imageUrl?: string;
  featuredOnHome: boolean;
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

function inferDivision(value: unknown, row: Record<string, unknown>): "Tech" | "Marketing" | "Finance" {
  const direct = asText(value);
  if (direct === "Tech" || direct === "Marketing" || direct === "Finance") return direct;

  const color = asText(row.showcaseColor).toLowerCase();
  if (color === "blue") return "Tech";
  if (color === "amber" || color === "orange") return "Finance";
  if (color === "green") return "Marketing";

  const services = asStringArray(row.showcaseServices).map((item) => item.toLowerCase());
  if (services.some((item) => item.includes("grant") || item.includes("finance") || item.includes("ops"))) return "Finance";
  if (services.some((item) => item.includes("social") || item.includes("content") || item.includes("brand"))) return "Marketing";
  return "Tech";
}

function divisionLabel(value: "Tech" | "Marketing" | "Finance"): string {
  if (value === "Tech") return "Digital & Tech";
  if (value === "Marketing") return "Marketing & Strategy";
  return "Finance & Operations";
}

function normalizeNeighborhood(value: unknown, row: Record<string, unknown>): string {
  const explicit = asText(value);
  if (explicit) return explicit;

  const address = asText(row.address);
  if (!address) return "Neighborhood, Borough";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0];
}

function normalizeDescription(value: unknown, fallback: string): string {
  const text = asText(value) || fallback;
  if (!text) return "Client project supported by Volta student teams.";
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function compareCards(a: PublicShowcaseCard, b: PublicShowcaseCard): number {
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

    const division = inferDivision(row.division, row);
    const type = divisionLabel(division);
    const neighborhood = normalizeNeighborhood(row.showcaseNeighborhood, row);
    const services = asStringArray(row.showcaseServices);
    const mergedServices = services.length > 0 ? services : defaultServicesFromDivision(division);
    const status = normalizeStatusFromShowcase(row.showcaseStatus) ?? mapBusinessStatusToShowcase(row.projectStatus);
    const desc = normalizeDescription(row.showcaseDescription, asText(row.notes));
    const url = asText(row.showcaseUrl) || asText(row.website) || "";
    const imageUrl = asText(row.showcaseImageUrl);
    const color = asText(row.showcaseColor)
      ? normalizeColor(row.showcaseColor)
      : defaultColorFromDivision(division);
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
      imageUrl: imageUrl || undefined,
      featuredOnHome,
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
