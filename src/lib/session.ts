import type { GeocodedLocation } from "./geocode.js";
import type { CurrentConditions } from "./weather.js";
import type { WeatherAlert } from "./alerts.js";

// In-memory, per-process session store — deliberately simple for a hackathon build. Lets a
// customer's standing household details and last guidance carry across turns/tool calls within
// a conversation (the "keeps context across sessions" bar), without a database. A real deployment
// would back this with a shared store (Redis/DynamoDB) so it survives process restarts and works
// across multiple server instances.
export interface PrepSession {
  id: string;
  /** Standing household details the customer has stated, e.g. "no car", "elderly resident". */
  preferences: string[];
  lastLocation?: GeocodedLocation;
  lastConditions?: CurrentConditions;
  lastAlerts?: WeatherAlert[];
  lastAlertsCoverage?: "supported" | "unsupported";
  lastPrepSteps?: string[];
  /** Steps already given this conversation, so refinement builds on them instead of repeating. */
  coveredSteps: string[];
  updatedAt: number;
}

const sessions = new Map<string, PrepSession>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours of inactivity

function pruneExpired(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.updatedAt < cutoff) sessions.delete(id);
  }
}

export function getOrCreateSession(id: string): PrepSession {
  pruneExpired();
  let session = sessions.get(id);
  if (!session) {
    session = { id, preferences: [], coveredSteps: [], updatedAt: Date.now() };
    sessions.set(id, session);
  }
  return session;
}

export function getSession(id: string): PrepSession | undefined {
  pruneExpired();
  return sessions.get(id);
}

export function touchSession(session: PrepSession): void {
  session.updatedAt = Date.now();
}
