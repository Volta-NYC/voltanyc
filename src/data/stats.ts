export interface VoltaStat {
  value: number;
  suffix: string;
}

export const VOLTA_STATS = {
  businessesServed: { value: 30, suffix: "+" } satisfies VoltaStat,
  nycNeighborhoods: { value: 9, suffix: "" } satisfies VoltaStat,
  studentMembers: { value: 100, suffix: "+" } satisfies VoltaStat,
  serviceTracks: { value: 3, suffix: "" } satisfies VoltaStat,
  bidPartners: { value: 9, suffix: "" } satisfies VoltaStat,
  floridaBusinessesServed: { value: 30, suffix: "+" } satisfies VoltaStat,
  operatingCities: { value: 6, suffix: "" } satisfies VoltaStat,
} as const;

export function formatStat(stat: VoltaStat): string {
  return `${stat.value}${stat.suffix}`;
}
