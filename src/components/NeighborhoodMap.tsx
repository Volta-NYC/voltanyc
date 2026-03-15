"use client";

import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { neighborhoods } from "@/data/neighborhoods";

const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((mod) => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), { ssr: false });

export interface MapProject {
  name: string;
  type: string;
  services: string[];
  neighborhood: string;
  status: "Active" | "In Progress" | "Upcoming";
  url?: string;
  colorClass: string;
}

interface NeighborhoodMapProps {
  projects: MapProject[];
}

// Derive precise map hex colors from Tailwind classes
const getColorHex = (colorClass: string): string => {
  if (colorClass.includes("green")) return "#85CC17";
  if (colorClass.includes("blue")) return "#3B82F6";
  if (colorClass.includes("orange")) return "#FB923C";
  if (colorClass.includes("amber")) return "#FBBF24";
  if (colorClass.includes("pink")) return "#F472B6";
  if (colorClass.includes("purple")) return "#C084FC";
  return "#85CC17"; // fallback
};

export default function NeighborhoodMap({ projects }: NeighborhoodMapProps) {
  // Map string neighborhood names to their known coordinates
  const markers = projects.map((p) => {
    const coords = neighborhoods.find(n => p.neighborhood.includes(n.name)) || neighborhoods.find(n => p.neighborhood.includes(n.borough));
    return {
      ...p,
      lat: coords ? coords.lat + (Math.random() - 0.5) * 0.005 : 40.7128, // slight jitter to prevent exact overlap
      lng: coords ? coords.lng + (Math.random() - 0.5) * 0.005 : -74.0060,
      hex: getColorHex(p.colorClass),
    };
  });
  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[40.700, -73.940]}
        zoom={11}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {/* Neighborhood coverage rings */}
        {neighborhoods.map((n) => (
          <CircleMarker
            key={n.name}
            center={[n.lat, n.lng]}
            radius={22}
            fillColor="#85CC17"
            fillOpacity={0.08}
            color="#85CC17"
            weight={1.5}
            opacity={0.3}
          >
            <Popup>
              <div style={{ fontFamily: "sans-serif", fontSize: 13, lineHeight: 1.5 }}>
                <strong>{n.name}</strong><br />
                <span style={{ color: "#6B7280", fontSize: 11 }}>{n.borough}</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Business dots */}
        {markers.map((b, i) => (
          <CircleMarker
            key={`${b.name}-${i}`}
            center={[b.lat, b.lng]}
            radius={9}
            fillColor={b.hex}
            fillOpacity={0.9}
            color={b.hex}
            weight={1.5}
          >
            <Popup>
              <div style={{ fontFamily: "sans-serif", fontSize: 13, lineHeight: 1.6, minWidth: 160 }}>
                <strong style={{ fontSize: 14 }}>{b.name}</strong><br />
                <span style={{ color: "#6B7280", fontSize: 11 }}>{b.type}</span><br />
                <span style={{ color: "#6B7280", fontSize: 11 }}>{b.neighborhood}</span><br />
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: b.hex }}>
                    {b.status}
                  </span>
                  <span style={{ fontSize: 11, color: "#374151" }}>·</span>
                  <span style={{ fontSize: 11, color: "#374151" }}>{b.services.join(", ")}</span>
                </div>
                {b.url && (
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 600, color: b.hex, textDecoration: "none" }}
                  >
                    View →
                  </a>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

    </div>
  );
}
