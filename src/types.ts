/**
 * Shared types for aria-mcp-trafik-dk
 */

/** A single traffic event or roadwork returned by the tools */
export interface TrafficEvent {
  type: string;       // Human-readable event type derived from TrafficMan2_Type or layer name
  road: string;       // Road/route name extracted from description or header
  location: string;   // Full location header
  description: string; // Plain-text description (HTML stripped)
  from?: string;      // beginPeriod (ISO or Danish date string)
  to?: string;        // endPeriod when present
  severity?: string;  // "blocking" | "warning" | "queue" | "roadwork" | "info"
  suspended?: boolean; // Whether the event is suspended (inactive but stored)
  coordinates?: [number, number]; // [lon, lat] WGS84 when available
}

/** A critical/planned roadwork announcement */
export interface CriticalAnnouncement {
  id: string;
  title: string;
  description: string; // Plain-text (HTML stripped)
  category?: string;
  validFrom?: string;
}

/** GeoJSON feature properties from big-screen-events.json */
export interface VdFeatureProperties {
  featureId?: string;
  layerId?: string;
  title?: string;
  header?: string;
  description?: string;
  TrafficMan2_Type?: string;
  beginPeriod?: string;
  endPeriod?: string;
  kommune?: string;
  suspended?: string; // "true" | "false"
  future?: string;    // "true" | "false"
  direction?: string;
  visible?: string;
}

/** GeoJSON feature from Vejdirektoratet */
export interface VdFeature {
  type: "Feature";
  geometry: {
    type: "Point" | "LineString" | "Polygon";
    coordinates: [number, number] | [number, number][] | [number, number][][];
  };
  properties: VdFeatureProperties;
}

/** GeoJSON FeatureCollection layer from big-screen-events.json */
export interface VdFeatureCollection {
  type: "FeatureCollection";
  layerId: string;
  layerName: string;
  features: VdFeature[];
}

/** Shape of big-screen-events.json: an array of FeatureCollections */
export type BigScreenEvents = VdFeatureCollection[];

/** Shape of critical-announcements.json: a single FeatureCollection */
export interface CriticalAnnouncementsResponse {
  layerId: string;
  layerName: string;
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      featureId?: string;
      title?: string;
      description?: string;
      category?: string;
      validFrom?: string;
    };
  }>;
}
