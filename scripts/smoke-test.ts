import "dotenv/config";
import { getPrepGuidance } from "../src/tools/getPrepGuidance.js";

const location = process.argv[2] ?? "Tampa, FL";
const context = process.argv[3];

const result = await getPrepGuidance({ location, context });

console.log("Location:", result.location);
console.log("Conditions:", result.conditions);
console.log("Alerts coverage:", result.alertsCoverage, "| active alerts:", result.activeAlertCount);
console.log("Primary concern:", result.primaryConcern, `(severity: ${result.severity})`);
console.log("\nReasoning:\n" + result.reasoning);
console.log("\nPrep steps:");
result.prepSteps.forEach((s, i) => console.log(`${i + 1}. ${s}`));
