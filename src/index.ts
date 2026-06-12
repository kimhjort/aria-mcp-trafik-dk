#!/usr/bin/env node
/**
 * aria-mcp-trafik-dk — MCP server over stdio
 *
 * Exposes three tools:
 *   traffic_events  — current Danish road traffic incidents, roadblocks, queues
 *   roadworks       — planned/ongoing roadworks and critical closures
 *   events_near     — all traffic events within a radius of a geographic point
 *
 * Run via:  npx aria-mcp-trafik-dk
 *
 * Data source (keyless, public):
 *   Vejdirektoratet GCS feed — https://storage.googleapis.com/trafikkort-data/geojson/
 *   Discovered from trafikkort.vejdirektoratet.dk (trafikinfo.dk)
 *
 * Optional environment variables:
 *   VD_GCS_BASE   Override the GCS base URL (for testing or caching proxies)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { trafficEvents, roadworks, eventsNear } from "./traffic.js";
import type { EventType } from "./traffic.js";

// --- tool definitions ---
const TOOLS = [
  {
    name: "traffic_events",
    description:
      "Fetch current Danish road traffic events from Vejdirektoratet (trafikkort.vejdirektoratet.dk). " +
      "Returns incidents, accidents, roadblocks, queues, and closures on Danish state roads. " +
      "Each event includes type, road, location, description, from/to times, and severity. " +
      "Use this to warn ARIA before Kim drives — check for incidents on the route. " +
      "Data is updated approximately every 3 minutes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        area: {
          type: "string",
          description:
            "Optional free-text region or road filter (e.g. 'Horsens', 'E45', 'Vejle', 'Fyn'). " +
            "Matched case-insensitively against location, road, and description fields.",
        },
        type: {
          type: "string",
          enum: ["all", "incident", "roadwork", "queue"],
          description:
            "Filter by event category. " +
            "'incident' = accidents, obstructions, closures, weather events. " +
            "'roadwork' = maintenance and construction works. " +
            "'queue' = traffic queues. " +
            "'all' = everything (default).",
        },
      },
      required: [],
    },
  },
  {
    name: "roadworks",
    description:
      "Fetch planned and ongoing roadworks on Danish state roads from Vejdirektoratet. " +
      "Combines two feeds: active roadwork layers from the live events feed " +
      "and critical-announcements.json (major planned closures, e.g. motorway bridge work). " +
      "Returns roadwork entries with title, description, road, location, and validity times. " +
      "Use this when ARIA needs to warn about scheduled disruptions before a drive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        area: {
          type: "string",
          description:
            "Optional free-text region or road filter (e.g. 'E45', 'Horsens', 'København'). " +
            "Matched case-insensitively against title, location, road, and description fields.",
        },
      },
      required: [],
    },
  },
  {
    name: "events_near",
    description:
      "Find current traffic events (incidents, roadblocks, queues, roadworks) " +
      "within a geographic radius of a given coordinate. " +
      "Useful for checking conditions near a specific destination or along a route. " +
      "Only events that carry Point geometry from Vejdirektoratet are returned; " +
      "events without coordinates are excluded. " +
      "Results are sorted by distance ascending. " +
      "Example: check for issues near Horsens (55.86, 9.85) before driving there.",
    inputSchema: {
      type: "object" as const,
      properties: {
        lat: {
          type: "number",
          description: "Latitude of the centre point (WGS84 decimal degrees).",
        },
        lon: {
          type: "number",
          description: "Longitude of the centre point (WGS84 decimal degrees).",
        },
        radiusKm: {
          type: "number",
          description: "Search radius in kilometres (default 25, max 200).",
          minimum: 1,
          maximum: 200,
        },
      },
      required: ["lat", "lon"],
    },
  },
];

// --- server bootstrap ---
const server = new Server(
  { name: "aria-mcp-trafik-dk", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (args ?? {}) as Record<string, any>;

  try {
    switch (name) {
      case "traffic_events": {
        const area = typeof a["area"] === "string" ? a["area"] : undefined;
        const typeArg = typeof a["type"] === "string" ? a["type"] : "all";
        const eventType: EventType =
          typeArg === "incident" || typeArg === "roadwork" || typeArg === "queue"
            ? typeArg
            : "all";
        const result = await trafficEvents(area, eventType);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "roadworks": {
        const area = typeof a["area"] === "string" ? a["area"] : undefined;
        const result = await roadworks(area);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "events_near": {
        const lat = typeof a["lat"] === "number" ? a["lat"] : NaN;
        const lon = typeof a["lon"] === "number" ? a["lon"] : NaN;
        if (isNaN(lat) || isNaN(lon)) {
          throw new Error("Parameters 'lat' and 'lon' are required and must be numbers.");
        }
        const radiusKm =
          typeof a["radiusKm"] === "number"
            ? Math.min(200, Math.max(1, a["radiusKm"]))
            : 25;
        const result = await eventsNear(lat, lon, radiusKm);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// --- start ---
const transport = new StdioServerTransport();
await server.connect(transport);
