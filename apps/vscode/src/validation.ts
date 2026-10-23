import { safeValidateHandoff } from "@context-bridge/shared";

export function validationMessage(input: unknown): string {
  const result = safeValidateHandoff(input);
  return result.success ? "Valid Context Bridge handoff." : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
}
