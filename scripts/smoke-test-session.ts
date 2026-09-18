import "dotenv/config";
import { getPrepGuidance } from "../src/tools/getPrepGuidance.js";
import { refinePrepGuidance } from "../src/tools/refinePrepGuidance.js";
import { rememberPreference } from "../src/tools/rememberPreference.js";

const location = process.argv[2] ?? "Tampa, FL";
const sessionId = `smoke-${Date.now()}`;

rememberPreference({ sessionId, preference: "no car" });

const first = await getPrepGuidance({ location, sessionId });
console.log("Turn 1 —", first.primaryConcern, `(severity: ${first.severity})`);
first.prepSteps.forEach((s, i) => console.log(`${i + 1}. ${s}`));
console.log(first.reasoning, "\n");

const refined = await refinePrepGuidance({
  sessionId,
  feedback: "We already did the emergency kit — what else, given we have no car?",
});
console.log("Turn 2 (refined) —", refined.primaryConcern, `(severity: ${refined.severity})`);
refined.prepSteps.forEach((s, i) => console.log(`${i + 1}. ${s}`));
console.log(refined.reasoning, "\n");

const overlap = first.prepSteps.filter((s) => refined.prepSteps.includes(s));
console.log(
  overlap.length === 0
    ? "OK: refined steps don't repeat the earlier ones verbatim."
    : `Note: repeated step(s) verbatim: ${overlap.join(", ")}`
);
