import { writeFile } from "node:fs/promises";
import {
  generateHandoffArtifacts
} from "../src/index.js";
import { sampleHandoff } from "./fixtures.js";

const artifacts = generateHandoffArtifacts(sampleHandoff);

await writeFile("handoff.json", artifacts.json, "utf8");
await writeFile("HANDOFF.md", artifacts.markdown, "utf8");

console.log("Generated handoff.json and HANDOFF.md");
