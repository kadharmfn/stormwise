import "dotenv/config";
import { geocodeLocation } from "../src/lib/geocode.js";
import { getCurrentConditions } from "../src/lib/weather.js";
import { getActiveAlerts } from "../src/lib/alerts.js";

const location = process.argv[2] ?? "Tampa, FL";

const geocoded = await geocodeLocation(location);
console.log("Geocoded:", geocoded);

const conditions = await getCurrentConditions(geocoded.lat, geocoded.lng);
console.log("\nConditions:", conditions);

const alertsResult = await getActiveAlerts(geocoded.lat, geocoded.lng);
console.log("\nAlerts coverage:", alertsResult.coverage);
console.log("Active alerts:", alertsResult.alerts.length);
for (const a of alertsResult.alerts) {
  console.log(`- ${a.event} (${a.severity}/${a.urgency}): ${a.headline}`);
}
