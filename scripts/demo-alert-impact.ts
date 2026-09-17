// Demo script: shows the actual contribution side-by-side — the same location reasoned about
// with live official NWS alert data vs. without it (a generic, alert-blind baseline similar to
// what a static seasonal-tips page would produce).
import "dotenv/config";
import { geocodeLocation } from "../src/lib/geocode.js";
import { getCurrentConditions } from "../src/lib/weather.js";
import { getActiveAlerts } from "../src/lib/alerts.js";
import { reasonAboutPrep } from "../src/lib/bedrock.js";

const location = process.argv[2] ?? "Tampa, FL";

const geocoded = await geocodeLocation(location);
const conditions = await getCurrentConditions(geocoded.lat, geocoded.lng);
const alertsResult = await getActiveAlerts(geocoded.lat, geocoded.lng);

console.log(`Location: ${geocoded.formattedAddress}`);
console.log(`Conditions: ${conditions.description}, ${conditions.temperatureC}°C`);
console.log(
  `Active alerts: ${alertsResult.alerts.length} (coverage: ${alertsResult.coverage})`
);
alertsResult.alerts.forEach((a) => console.log(`  - ${a.event}: ${a.headline}`));

const [withAlerts, withoutAlerts] = await Promise.all([
  reasonAboutPrep({
    location: geocoded,
    conditions,
    alerts: alertsResult.alerts,
    alertsCoverage: alertsResult.coverage,
    includeAlerts: true,
  }),
  reasonAboutPrep({
    location: geocoded,
    conditions,
    alerts: alertsResult.alerts,
    alertsCoverage: alertsResult.coverage,
    includeAlerts: false,
  }),
]);

console.log("\n=== Alert-aware (stormwise) ===");
console.log(`${withAlerts.primaryConcern} (severity: ${withAlerts.severity})`);
console.log(withAlerts.reasoning);
withAlerts.prepSteps.forEach((s, i) => console.log(`${i + 1}. ${s}`));

console.log("\n=== Alert-blind baseline ===");
console.log(`${withoutAlerts.primaryConcern} (severity: ${withoutAlerts.severity})`);
console.log(withoutAlerts.reasoning);
withoutAlerts.prepSteps.forEach((s, i) => console.log(`${i + 1}. ${s}`));
