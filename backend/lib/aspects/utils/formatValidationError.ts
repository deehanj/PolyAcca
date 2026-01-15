/**
 * Format a validation error message showing which environment variables
 * are configured and which are missing.
 */
export function formatValidationError(
    functionName: string,
    entry: string,
    required: string[],
    configured: string[]
): string {
    const configuredSet = new Set(configured);

    const lines = [
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `❌ ${functionName} - Missing Environment Variables`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        `Entry: ${entry}`,
        "",
        "Environment Variables:",
        ...required.map((v) =>
            configuredSet.has(v) ? `  ✅ ${v}` : `  ❌ ${v}  (MISSING)`
        ),
        "",
        "Add the missing variables to your Lambda's environment configuration.",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
    ];

    return lines.join("\n");
}
