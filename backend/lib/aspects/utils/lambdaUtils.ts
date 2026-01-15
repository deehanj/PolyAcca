import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";

/**
 * Default environment variables that should be ignored during validation.
 * These are typically provided by the Lambda runtime or are optional.
 */
export const DEFAULT_IGNORED_ENV_VARS = [
    "NODE_OPTIONS", // Common in Lambda configs
    "AWS_REGION", // Provided by Lambda runtime
    "AWS_EXECUTION_ENV", // Provided by Lambda runtime
    "AWS_LAMBDA_*", // All Lambda runtime vars
    "_HANDLER", // Lambda runtime
    "LAMBDA_TASK_ROOT", // Lambda runtime
];

/**
 * Convert wildcard patterns to regex patterns.
 * Supports wildcards like "AWS_LAMBDA_*" -> /^AWS_LAMBDA_.*$/
 */
export function patternsToRegex(patterns: string[]): RegExp[] {
    return patterns.map((pattern) => {
        const regexPattern = pattern.replace(/\*/g, ".*");
        return new RegExp(`^${regexPattern}$`);
    });
}

/**
 * Extract the entry point from a NodejsFunction by traversing its construct tree.
 * The entry point is stored in the bundling props of the AssetStaging construct.
 * @param {nodejs.NodejsFunction} lambdaFunction - The NodejsFunction to extract the entry point from
 * @returns {string | null} The absolute path to the Lambda entry point, or null if not found
 */
export function findLambdaEntryPoint(
    lambdaFunction: nodejs.NodejsFunction
): string | null {
    try {
        // Navigate: NodejsFunction -> Code (Asset) -> Stage (AssetStaging) -> bundling.props.entry
        const codeAsset = lambdaFunction.node.tryFindChild("Code");
        /* v8 ignore next 3 -- @preserve */
        if (!codeAsset) {
            return null;
        }

        const stage = codeAsset.node.tryFindChild("Stage");
        /* v8 ignore next 3 -- @preserve */
        if (!stage) {
            return null;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const bundling = (stage as any).fingerprintOptions?.bundling;
        /* v8 ignore next 3 -- @preserve */
        if (!bundling) {
            return null;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const entry = bundling.props?.entry;
        /* v8 ignore next 3 -- @preserve */
        if (!entry || typeof entry !== "string") {
            return null;
        }

        return entry;
        /* v8 ignore next 3 -- @preserve */
    } catch {
        /* v8 ignore next 1 -- @preserve */
        return null;
    }
}
