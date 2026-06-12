import { describe, it, expect } from "vitest";
import {
  stripHtml,
  haversineKm,
  trafficEvents,
  roadworks,
  eventsNear,
} from "../src/traffic.js";
import type {
  BigScreenEvents,
  CriticalAnnouncementsResponse,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixture data — captured from live Vejdirektoratet GCS feed 2026-06-13
// (https://storage.googleapis.com/trafikkort-data/geojson/big-screen-events.json)
// ---------------------------------------------------------------------------

const FIXTURE_EVENTS: BigScreenEvents = [
  {
    type: "FeatureCollection",
    layerId: "layer_id_19H1",
    layerName: "current-other-traffic-announcements.point",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [9.8521, 55.8606] },
        properties: {
          featureId: "abc123_1",
          layerId: "layer_id_19H1",
          title: "Havareret køretøj",
          header: "Kør forsigtigt - E45 fra Randers mod Aalborg mellem <35> Hobro V og <34> Hobro N",
          description:
            "<p>E45 fra Randers mod Aalborg mellem &lt;35&gt; Hobro V og &lt;34&gt; Hobro N</p><p>Havareret køretøj, Pas på</p><p>I højre spor, vejhjælp er på vej </p>",
          TrafficMan2_Type:
            "org.vd.trafficmap.datexii.v32.datamodel.GeneralInstructionOrMessageToRoadUsers",
          beginPeriod: "13-06-2026 kl. 00:12",
          suspended: "false",
          future: "false",
          visible: "true",
          kommune: "Vejdirektoratet",
          direction: "",
        },
      },
    ],
  },
  {
    type: "FeatureCollection",
    layerId: "layer_id_19G1",
    layerName: "current-roadblocks.point",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [9.75931, 55.516537] },
        properties: {
          featureId: "def456_1",
          layerId: "layer_id_19G1",
          title: "Spærret vej/område",
          header:
            "Spærret vej/område - E20 Fynske Motorvej fra Fredericia mod Odense mellem Ny Lillebæltsbro og <58b> Middelfart",
          description:
            "<p>E20 Fynske Motorvej fra Fredericia mod Odense<\/p><p>Vejen er spærret, Grundet uheld<\/p><p><periodDescription>Til kl. 01:30.<\/periodDescription><\/p>",
          TrafficMan2_Type:
            "org.vd.trafficmap.datexii.v32.datamodel.RoadOrCarriagewayOrLaneManagement",
          beginPeriod: "12-06-2026 kl. 01:01",
          endPeriod: "12-06-2026 kl. 01:30",
          suspended: "false",
          future: "false",
          visible: "true",
          kommune: "Vejdirektoratet",
          direction: "",
        },
      },
    ],
  },
  {
    type: "FeatureCollection",
    layerId: "layer_id_19K1",
    layerName: "current-queue.point",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [9.727003, 55.52561] },
        properties: {
          featureId: "ghi789_1",
          layerId: "layer_id_19K1",
          title: "Kø",
          header:
            "Kø - E20 Fynske Motorvej fra Fredericia mod Middelfart mellem <59> Fredericia S og Ny Lillebæltsbro",
          description:
            "<p>E20 Fynske Motorvej fra Fredericia mod Middelfart<\/p><p>Kø, Grundet uheld<\/p>",
          TrafficMan2_Type:
            "org.vd.trafficmap.datexii.v32.datamodel.AbnormalTraffic",
          beginPeriod: "12-06-2026 kl. 01:36",
          endPeriod: "12-06-2026 kl. 03:00",
          suspended: "false",
          future: "false",
          visible: "true",
          kommune: "Vejdirektoratet",
          direction: "",
        },
      },
    ],
  },
  {
    type: "FeatureCollection",
    layerId: "layer_id_19I1",
    layerName: "current-blocking-events.point",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [9.8931267, 55.269926] },
        properties: {
          featureId: "jkl012_1",
          layerId: "layer_id_19I1",
          title: "Begivenhed med spærring",
          header:
            "Begivenhed med spærring - Østergade, 5610 Assens spærret fra nr. 1",
          description:
            "<p>Større begivenhed, Vejen er spærret<\/p><p>Østergade, 5610 Assens<\/p>",
          TrafficMan2_Type:
            "org.vd.trafficmap.datexii.v32.datamodel.PublicEvent",
          beginPeriod: "10-06-2026 kl. 08:00",
          endPeriod: "02-09-2026 kl. 23:30",
          suspended: "false",
          future: "false",
          visible: "true",
          kommune: "Assens",
          direction: "",
        },
      },
    ],
  },
];

const FIXTURE_ANNOUNCEMENTS: CriticalAnnouncementsResponse = {
  layerId: "layer_id_22",
  layerName: "critical-announcements",
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        featureId: "9349df74-15e8-4ffc-93e7-e3e236720da9",
        title: "E45 Østjyske Motorvej spærres ved Horsens",
        description:
          "<p>I forbindelse med bronedrivning spærres E45 Østjyske Motorvej i begge retninger ml. 56b Horsens C og 57 Horsens S fra lørdag d. 13/6 kl. 17 til søndag d. 14/6 kl. 9. Skiltet omkørsel sker via hhv. 56b Horsens C og 57 Horsens S.</p>",
        category: "Trafikal forsidemelding (trafikkort)",
        validFrom: "2026-06-12T10:56:00.410Z",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Unit tests: stripHtml
// ---------------------------------------------------------------------------

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("decodes &lt; and &gt;", () => {
    expect(stripHtml("&lt;35&gt; Hobro")).toBe("<35> Hobro");
  });

  it("decodes &amp;", () => {
    expect(stripHtml("Road &amp; Route")).toBe("Road & Route");
  });

  it("removes <periodDescription> blocks", () => {
    expect(
      stripHtml("<p>Traffic<\/p><p><periodDescription>Til kl. 01:30.<\/periodDescription><\/p>")
    ).toBe("Traffic");
  });

  it("collapses multiple spaces", () => {
    expect(stripHtml("<p>Hello</p>   <p>World</p>")).toBe("Hello World");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  it("handles plain text without tags", () => {
    expect(stripHtml("No tags here")).toBe("No tags here");
  });
});

// ---------------------------------------------------------------------------
// Unit tests: haversineKm
// ---------------------------------------------------------------------------

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(55.86, 9.85, 55.86, 9.85)).toBeCloseTo(0, 5);
  });

  it("calculates Horsens ↔ Vejle correctly (~26 km)", () => {
    // Horsens: 55.8606, 9.8502; Vejle: 55.7114, 9.5368
    const dist = haversineKm(55.8606, 9.8502, 55.7114, 9.5368);
    expect(dist).toBeGreaterThan(24);
    expect(dist).toBeLessThan(28);
  });

  it("calculates Copenhagen ↔ Aarhus correctly (~155–165 km)", () => {
    // Copenhagen: 55.6761, 12.5683; Aarhus: 56.1572, 10.2107
    const dist = haversineKm(55.6761, 12.5683, 56.1572, 10.2107);
    expect(dist).toBeGreaterThan(150);
    expect(dist).toBeLessThan(175);
  });

  it("is commutative", () => {
    const d1 = haversineKm(55.86, 9.85, 56.16, 10.21);
    const d2 = haversineKm(56.16, 10.21, 55.86, 9.85);
    expect(d1).toBeCloseTo(d2, 8);
  });
});

// ---------------------------------------------------------------------------
// Integration tests against fixtures (no network)
// ---------------------------------------------------------------------------

// Mock the fetch functions to return fixture data
import { vi, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(eventsData: BigScreenEvents, announcementsData: CriticalAnnouncementsResponse) {
  // We mock the module-level fetch in traffic.ts by patching globalThis.fetch
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
    const urlStr = String(url);
    if (urlStr.includes("big-screen-events.json")) {
      return new Response(JSON.stringify(eventsData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (urlStr.includes("critical-announcements.json")) {
      return new Response(JSON.stringify(announcementsData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("trafficEvents — fixture-based (no network)", () => {
  it("returns events from all layers when type=all", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents(undefined, "all");
    expect(events.length).toBe(4);
  });

  it("filters to queues only when type=queue", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents(undefined, "queue");
    expect(events.length).toBe(1);
    expect(events[0].severity).toBe("queue");
  });

  it("filters to incidents (non-roadwork, non-queue) when type=incident", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents(undefined, "incident");
    // roadblocks + other-announcements + blocking-events = 3
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const e of events) {
      expect(e.severity).not.toBe("queue");
      expect(e.severity).not.toBe("roadwork");
    }
  });

  it("filters by area string (case insensitive)", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents("e45");
    expect(events.length).toBeGreaterThanOrEqual(1);
    for (const e of events) {
      const combined = (e.location + e.road + e.description).toLowerCase();
      expect(combined).toContain("e45");
    }
  });

  it("returns empty array when area matches nothing", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents("XYZZY_NO_MATCH_12345");
    expect(events).toHaveLength(0);
  });

  it("populates required fields on each event", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents();
    for (const e of events) {
      expect(typeof e.type).toBe("string");
      expect(typeof e.road).toBe("string");
      expect(typeof e.location).toBe("string");
      expect(typeof e.description).toBe("string");
      expect(typeof e.severity).toBe("string");
    }
  });

  it("strips HTML tags from description (road numbers like <35> are plain text after entity decoding)", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents();
    for (const e of events) {
      // HTML *tags* like <p>, <b>, <span class="..."> must be gone.
      // Road exit markers like <35> are decoded from &lt;35&gt; and are intentionally kept as plain text.
      expect(e.description).not.toMatch(/<[a-zA-Z][^>]*>/); // no opening HTML tags
      expect(e.description).not.toMatch(/<\/[a-zA-Z]+>/);   // no closing HTML tags
    }
  });

  it("parses suspended flag correctly", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents();
    for (const e of events) {
      expect(typeof e.suspended).toBe("boolean");
    }
  });

  it("includes WGS84 coordinates for Point features", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const events = await trafficEvents();
    const withCoords = events.filter((e) => e.coordinates !== undefined);
    expect(withCoords.length).toBeGreaterThan(0);
    for (const e of withCoords) {
      expect(e.coordinates).toHaveLength(2);
      const [lon, lat] = e.coordinates!;
      expect(lon).toBeGreaterThan(-10);
      expect(lon).toBeLessThan(20);
      expect(lat).toBeGreaterThan(50);
      expect(lat).toBeLessThan(60);
    }
  });
});

describe("roadworks — fixture-based (no network)", () => {
  it("includes critical announcements", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const result = await roadworks();
    // Critical announcement: E45 Horsens
    const announcement = result.find(
      (r) => "title" in r && r.title.includes("E45")
    );
    expect(announcement).toBeDefined();
  });

  it("filters by area for critical announcements", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const result = await roadworks("Horsens");
    expect(result.length).toBeGreaterThanOrEqual(1);
    const announcement = result.find(
      (r) => "title" in r && r.title.includes("Horsens")
    );
    expect(announcement).toBeDefined();
  });

  it("returns empty when area filter excludes everything", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const result = await roadworks("XYZZY_NO_MATCH_99999");
    expect(result).toHaveLength(0);
  });

  it("strips HTML from critical announcement descriptions", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const result = await roadworks();
    for (const r of result) {
      if ("description" in r) {
        expect(r.description).not.toMatch(/<[^>]+>/);
      }
    }
  });
});

describe("eventsNear — fixture-based (no network)", () => {
  it("returns events within radius of Horsens (55.86, 9.85)", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    // E45 Hobro event is at 9.8521, 55.8606 — almost exactly at Horsens
    const result = await eventsNear(55.86, 9.85, 5);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const e45 = result.find((e) => e.location.toLowerCase().includes("hobro") || e.road.toLowerCase().includes("e45"));
    expect(e45).toBeDefined();
  });

  it("includes distanceKm on results", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const result = await eventsNear(55.86, 9.85, 200);
    for (const e of result) {
      expect(typeof e.distanceKm).toBe("number");
      expect(e.distanceKm).toBeGreaterThanOrEqual(0);
    }
  });

  it("results are sorted by distanceKm ascending", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    const result = await eventsNear(55.86, 9.85, 200);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].distanceKm).toBeGreaterThanOrEqual(result[i - 1].distanceKm);
    }
  });

  it("returns no results outside radius", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    // Tiny radius in the middle of nowhere
    const result = await eventsNear(57.0, 8.0, 0.1);
    expect(result).toHaveLength(0);
  });

  it("returns all events with coordinates when radius is large (200 km)", async () => {
    mockFetch(FIXTURE_EVENTS, FIXTURE_ANNOUNCEMENTS);
    // Centre at Denmark's approximate centroid; all fixture events are in Denmark
    const all = await eventsNear(56.0, 10.0, 200);
    const withCoords = FIXTURE_EVENTS.flatMap((c) =>
      c.features.filter((f) => f.geometry?.type === "Point")
    );
    expect(all.length).toBe(withCoords.length);
  });
});

// ---------------------------------------------------------------------------
// Fixture-based: raw JSON field parsing
// ---------------------------------------------------------------------------

describe("VdFeatureProperties JSON parsing", () => {
  const sampleProps = FIXTURE_EVENTS[0].features[0].properties;

  it("reads beginPeriod as a string", () => {
    expect(typeof sampleProps.beginPeriod).toBe("string");
    expect(sampleProps.beginPeriod).toContain("2026");
  });

  it("reads TrafficMan2_Type as a DATEX II class path", () => {
    expect(sampleProps.TrafficMan2_Type).toContain("datexii");
  });

  it("reads suspended as a string 'true' or 'false'", () => {
    expect(["true", "false"]).toContain(sampleProps.suspended);
  });

  it("reads coordinates as [lon, lat]", () => {
    const coords = FIXTURE_EVENTS[0].features[0].geometry.coordinates as [number, number];
    const [lon, lat] = coords;
    expect(lon).toBeGreaterThan(8);
    expect(lon).toBeLessThan(16);
    expect(lat).toBeGreaterThan(54);
    expect(lat).toBeLessThan(58);
  });
});

describe("CriticalAnnouncements JSON parsing", () => {
  const feat = FIXTURE_ANNOUNCEMENTS.features[0];

  it("reads featureId as a UUID-like string", () => {
    expect(feat.properties.featureId).toMatch(
      /^[0-9a-f-]{36}$/
    );
  });

  it("reads validFrom as ISO datetime", () => {
    expect(feat.properties.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reads title as non-empty string", () => {
    expect(typeof feat.properties.title).toBe("string");
    expect((feat.properties.title ?? "").length).toBeGreaterThan(0);
  });
});
