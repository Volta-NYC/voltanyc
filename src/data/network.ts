export type ChapterLocation = {
  name: string;
  state: string;
  lat: number;
  lng: number;
  type: "hub" | "chapter" | "international";
  subtitle?: string;
  globeLabel?: string;
};

export type ChapterConnection = [from: string, to: string];

// Every entry must clear one of two bars: at least two active members in that
// place, or an official chapter. Both are checkable against the member table
// and the chapters table, which the previous list was not — it carried Boston,
// Alabama and Washington on one member or none, while Texas, this network's
// second-largest state at eleven, appeared only as Austin.
//
// City versus state follows where members actually cluster. New Jersey's ten
// are spread across nine towns with no centre, so it reads as a state; Texas
// splits into Austin and Houston because both are real concentrations. A single
// member in a small town is folded into the state name rather than promoted to
// a pin the town would not recognise.
//
// Members in Canada and India are deliberately absent: this section is headed
// "communities across the country", and quietly widening it to a globe is a
// copy decision, not a data one.
// Every entry clears one of two bars: at least two active members, or an
// official chapter. Both are checkable against the member table and the
// chapters table, which the previous list was not — it carried Boston, Alabama
// and Washington on one member or none, while Texas, this network's
// second-largest state at eleven, appeared only as Austin.
//
// City versus state follows where members actually cluster. New Jersey's ten
// are spread across nine towns with no centre, so it reads as a state; Texas
// splits into Austin and Houston because both are real concentrations.
//
// Order is the hub, then alphabetical. Member count would rank them more
// honestly but a reader cannot see counts, so it would look unsorted.
//
// "international" entries appear on the globe only. The section is headed
// "communities across the country", so listing Toronto beside Baltimore in that
// sentence would contradict the copy above it.
export const chapterLocations: ChapterLocation[] = [
  {
    name: "New York City",
    state: "NY",
    lat: 40.7128,
    lng: -74.006,
    type: "hub",
  },
  { name: "Austin", state: "TX", lat: 30.2672, lng: -97.7431, type: "chapter" },
  { name: "Baltimore", state: "MD", lat: 39.2904, lng: -76.6122, type: "chapter" },
  { name: "California", state: "CA", lat: 36.7783, lng: -119.4179, type: "chapter", globeLabel: "California" },
  // No members yet. Listed on the chapter bar, not the member bar: the chapters
  // table has it as "Launching", which is a different claim from presence.
  { name: "Chicago", state: "IL", lat: 41.8781, lng: -87.6298, type: "chapter" },
  { name: "Florida", state: "FL", lat: 28.7986, lng: -81.2731, type: "chapter", globeLabel: "Florida" },
  { name: "Houston", state: "TX", lat: 29.7604, lng: -95.3698, type: "chapter" },
  { name: "Long Island", state: "NY", lat: 40.7891, lng: -73.135, type: "chapter" },
  { name: "Michigan", state: "MI", lat: 42.4806, lng: -83.4755, type: "chapter", globeLabel: "Michigan" },
  { name: "New Jersey", state: "NJ", lat: 40.3573, lng: -74.6672, type: "chapter", globeLabel: "New Jersey" },
  { name: "North Carolina", state: "NC", lat: 35.4088, lng: -80.5795, type: "chapter", globeLabel: "North Carolina" },
  { name: "Salt Lake City", state: "UT", lat: 40.7608, lng: -111.891, type: "chapter" },
  { name: "Virginia", state: "VA", lat: 39.0438, lng: -77.4874, type: "chapter", globeLabel: "Virginia" },

  // Globe only — see note above.
  { name: "Toronto", state: "Canada", lat: 43.6532, lng: -79.3832, type: "international", globeLabel: "Toronto, Canada" },
  { name: "Chennai", state: "India", lat: 13.0827, lng: 80.2707, type: "international", globeLabel: "Chennai, India" },
];

const hub = chapterLocations.find((location) => location.type === "hub");

if (!hub) {
  throw new Error("The Novus network requires a hub location.");
}

export const chapterConnections: ChapterConnection[] = chapterLocations
  .filter((location) => location.type === "chapter")
  .map((location) => [hub.name, location.name] as ChapterConnection);
