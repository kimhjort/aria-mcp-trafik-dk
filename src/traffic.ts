/**
 * Vejdirektoratet traffic data client
 *
 * Data source: trafikkort.vejdirektoratet.dk — GCS-hosted GeoJSON feeds
 *
 * Endpoints (public, keyless, ~3 min update cadence):
 *   big-screen-events.json        — all current traffic incidents, queues, roadblocks
 *   critical-announcements.json   — major planned roadworks and announcements
 *
 * Both files live at:
 *   https://storage.googleapis.com/trafikkort-data/geojson/<filename>
 *
 * Attribution: Vejdirektoratet / trafikinfo.dk (Danish Road Directorate)
 * License: Free public traffic data — see https://www.vejdirektoratet.dk/side/trafikinfodk
 * NAP reference: https://nap.vd.dk (National Access Point for road data)
 */

import type {
  BigScreenEvents,
  CriticalAnnouncementsResponse,
  TrafficEvent,
  CriticalAnnouncement,
  VdFeatureCollection,
  VdFeatureProperties,
} from "./types.js";

const PKG_VERSION = "1.0.0";
const USER_AGENT = `aria-mcp-trafik-dk/${PKG_VERSION} (https://github.com/kimhjort/aria-mcp-trafik-dk)`;

const GCS_BASE =
  process.env["VD_GCS_BASE"] ??
  "https://storage.googleapis.com/trafikkort-data/geojson";

const EVENTS_URL = `${GCS_BASE}/big-screen-events.json`;
const ANNOUNCEMENTS_URL = `${GCS_BASE}/critical-announcements.json`;

// ---------------------------------------------------------------------------
// Layer classification helpers
// ---------------------------------------------------------------------------

/** Map a layer name to a human-readable severity/category string */
function layerToSeverity(layerName: string): string {
  if (layerName.includes("roadblock") || layerName.includes("blocking")) return "blocking";
  if (layerName.includes("queue")) return "queue";
  if (layerName.includes("roadwork")) return "roadwork";
  if (layerName.includes("slippery") || layerName.includes("ice") || layerName.includes("snow")) return "road-condition";
  if (layerName.includes("wind")) return "wind";
  return "warning";
}

/** Map a DATEX II type class name to a concise English label */
function datexTypeToLabel(fullType: string | undefined): string {
  if (!fullType) return "Traffic event";
  const short = fullType.split(".").pop() ?? fullType;
  const map: Record<string, string> = {
    Accident: "Accident",
    AbnormalTraffic: "Abnormal traffic / queue",
    AnimalPresenceObstruction: "Animal on road",
    VehicleObstruction: "Vehicle obstruction",
    GeneralObstruction: "Obstruction",
    RoadOrCarriagewayOrLaneManagement: "Road/lane closure",
    NonWeatherRelatedRoadConditions: "Road condition",
    WeatherRelatedRoadConditions: "Weather-related road condition",
    PoorEnvironmentConditions: "Poor visibility / wind",
    Conditions: "Road condition",
    GeneralInstructionOrMessageToRoadUsers: "Traffic message",
    PublicEvent: "Public event / closure",
    MaintenanceWorks: "Maintenance works",
    ConstructionWorks: "Construction works",
  };
  return map[short] ?? short;
}

// ---------------------------------------------------------------------------
// HTML stripping
// ---------------------------------------------------------------------------

/** Strip HTML tags and decode common HTML entities for plain-text output */
export function stripHtml(html: string): string {
  return html
    .replace(/<periodDescription>[^<]*<\/periodDescription>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Distance helper (for events_near)
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;

/**
 * Haversine distance in km between two WGS84 points.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Vejdirektoratet GCS fetch failed for ${url}: ${response.status} ${response.statusText}\n${body.substring(0, 200)}`
    );
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Conversion: VdFeatureCollection → TrafficEvent[]
// ---------------------------------------------------------------------------

function collectionToEvents(col: VdFeatureCollection): TrafficEvent[] {
  const severity = layerToSeverity(col.layerName);
  return col.features
    .filter((f) => f.properties?.visible !== "false")
    .map((f) => {
      const p: VdFeatureProperties = f.properties ?? {};
      const coords =
        f.geometry?.type === "Point"
          ? (f.geometry.coordinates as [number, number])
          : undefined;

      return {
        type: datexTypeToLabel(p.TrafficMan2_Type),
        road: extractRoad(p.header ?? p.title ?? ""),
        location: stripHtml(p.header ?? p.title ?? ""),
        description: stripHtml(p.description ?? ""),
        from: p.beginPeriod,
        to: p.endPeriod,
        severity,
        suspended: p.suspended === "true",
        coordinates: coords,
      } satisfies TrafficEvent;
    });
}

/**
 * Attempt to extract a road name/number from the header string.
 * Headers look like "Kø - E20 Fynske Motorvej fra ... mellem ..."
 * or "Advarsel - Rute 15 fra ..."
 */
function extractRoad(header: string): string {
  // Strip leading "Title - " prefix
  const afterDash = header.includes(" - ") ? header.split(" - ").slice(1).join(" - ") : header;
  // Return the first meaningful segment (up to "fra", "mod", "mellem", or 60 chars)
  const trimmed = afterDash.trim();
  const match = trimmed.match(/^([^,]+?)(?:\s+fra\s|\s+mod\s|\s+mellem\s|$)/);
  if (match) return match[1].trim().substring(0, 80);
  return trimmed.substring(0, 80);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch all current traffic events from big-screen-events.json */
export async function fetchTrafficEvents(): Promise<BigScreenEvents> {
  return fetchJson<BigScreenEvents>(EVENTS_URL);
}

/** Fetch critical announcements (major planned roadworks) */
export async function fetchCriticalAnnouncements(): Promise<CriticalAnnouncementsResponse> {
  return fetchJson<CriticalAnnouncementsResponse>(ANNOUNCEMENTS_URL);
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export type EventType = "incident" | "roadwork" | "queue" | "all";

/** Layer names that classify as roadwork */
const ROADWORK_LAYERS = new Set([
  "current-blocking-roadwork.point",
  "current-roadwork.point",
  "future-blocking-roadwork.point",
  "future-roadwork.point",
]);

/** Layer names that classify as incidents/warnings (not roadworks, not queues) */
const INCIDENT_LAYERS = new Set([
  "current-other-traffic-announcements.point",
  "current-roadblocks.point",
  "current-blocking-events.point",
  "current-slippery-road.point",
  "current-strong-wind-traffic-announcements.point",
]);

const QUEUE_LAYERS = new Set(["current-queue.point"]);

/**
 * traffic_events tool implementation.
 *
 * @param area   Optional free-text area/region filter (matched against location/road strings)
 * @param type   "incident" | "roadwork" | "queue" | "all" (default "all")
 */
export async function trafficEvents(
  area?: string,
  type: EventType = "all"
): Promise<TrafficEvent[]> {
  const data = await fetchTrafficEvents();

  const results: TrafficEvent[] = [];

  for (const col of data) {
    // Layer type filter
    if (type !== "all") {
      const isRoadwork = ROADWORK_LAYERS.has(col.layerName);
      const isQueue = QUEUE_LAYERS.has(col.layerName);
      const isIncident = INCIDENT_LAYERS.has(col.layerName) || (!isRoadwork && !isQueue);

      if (type === "roadwork" && !isRoadwork) continue;
      if (type === "queue" && !isQueue) continue;
      if (type === "incident" && !isIncident) continue;
    }

    const events = collectionToEvents(col);
    results.push(...events);
  }

  // Area filter
  if (area && area.trim()) {
    const needle = area.trim().toLowerCase();
    return results.filter(
      (e) =>
        e.location.toLowerCase().includes(needle) ||
        e.road.toLowerCase().includes(needle) ||
        e.description.toLowerCase().includes(needle)
    );
  }

  return results;
}

/**
 * roadworks tool implementation.
 *
 * Returns planned and ongoing roadworks from:
 *   1. critical-announcements.json (major planned closures)
 *   2. roadwork layers in big-screen-events.json (when present)
 *
 * @param area  Optional free-text region filter
 */
export async function roadworks(area?: string): Promise<(TrafficEvent | CriticalAnnouncement)[]> {
  const [eventsData, announcementsData] = await Promise.all([
    fetchTrafficEvents(),
    fetchCriticalAnnouncements(),
  ]);

  const results: (TrafficEvent | CriticalAnnouncement)[] = [];

  // 1. Roadwork layers from big-screen-events.json
  for (const col of eventsData) {
    if (ROADWORK_LAYERS.has(col.layerName)) {
      results.push(...collectionToEvents(col));
    }
  }

  // 2. Critical announcements
  for (const f of announcementsData.features ?? []) {
    const p = f.properties ?? {};
    const item: CriticalAnnouncement = {
      id: p.featureId ?? "",
      title: p.title ?? "",
      description: stripHtml(p.description ?? ""),
      category: p.category,
      validFrom: p.validFrom,
    };
    results.push(item);
  }

  // Area filter
  if (area && area.trim()) {
    const needle = area.trim().toLowerCase();
    return results.filter((e) => {
      if ("location" in e) {
        return (
          e.location.toLowerCase().includes(needle) ||
          e.road.toLowerCase().includes(needle) ||
          e.description.toLowerCase().includes(needle)
        );
      } else {
        return (
          e.title.toLowerCase().includes(needle) ||
          e.description.toLowerCase().includes(needle)
        );
      }
    });
  }

  return results;
}

/**
 * events_near tool implementation.
 *
 * Returns all current events (incidents + roadworks) within radiusKm of a point.
 * Only events that carry Point geometry can be distance-filtered; events without
 * coordinates are excluded.
 *
 * @param lat       Latitude (WGS84)
 * @param lon       Longitude (WGS84)
 * @param radiusKm  Search radius in km (default 25)
 */
export async function eventsNear(
  lat: number,
  lon: number,
  radiusKm = 25
): Promise<(TrafficEvent & { distanceKm: number })[]> {
  const data = await fetchTrafficEvents();

  const results: (TrafficEvent & { distanceKm: number })[] = [];

  for (const col of data) {
    const events = collectionToEvents(col);
    for (const ev of events) {
      if (!ev.coordinates) continue;
      const [eLon, eLat] = ev.coordinates;
      const dist = haversineKm(lat, lon, eLat, eLon);
      if (dist <= radiusKm) {
        results.push({ ...ev, distanceKm: Math.round(dist * 10) / 10 });
      }
    }
  }

  // Sort by distance ascending
  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}
