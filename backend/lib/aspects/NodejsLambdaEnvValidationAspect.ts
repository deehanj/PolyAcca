import { IAspect } from "aws-cdk-lib";
import { IConstruct } from "constructs";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { StaticEnvAnalyzer } from "./utils/staticEnvAnalyzer";
import {
    DEFAULT_IGNORED_ENV_VARS,
    patternsToRegex,
    findLambdaEntryPoint,
} from "./utils/lambdaUtils";
import { formatValidationError } from "./utils/formatValidationError";

export interface NodejsLambdaEnvValidationAspectProps {
    /**
     * Root directory of the project (usually the repo root)
     */
    rootDir: string;

    /**
     * Path aliases from tsconfig (e.g., { "@/": "src/" })
     * Defaults to { "@/": "src/" }
     */
    pathAliases?: Record<string, string>;

    /**
     * Environment variables that should be ignored during validation.
     * These are typically provided by the Lambda runtime or are optional.
     *
     * Default: ["NODE_OPTIONS", "AWS_EXECUTION_ENV", "AWS_LAMBDA_*"]
     */
    ignoredVars?: string[];

    /**
     * Enable verbose logging during analysis
     */
    verbose?: boolean;
}

/**
 * CDK Aspect that validates NodeJS Lambda environment variables at synth time.
 *
 * This aspect:
 * 1. Visits all NodejsFunction constructs (TypeScript/JavaScript Lambdas only)
 * 2. Performs static analysis on the Lambda entry point
 * 3. Follows all imports transitively to find requireEnvVar() calls
 * 4. Compares required vars against configured environment
 * 5. Fails synth if vars are missing
 *
 * Note: This only works for NodejsFunction constructs. Other Lambda types
 * (DockerImageFunction, Python, Go, etc.) are ignored.
 *
 * Usage:
 *   import { Aspects } from "aws-cdk-lib";
 *   import { NodejsLambdaEnvValidationAspect } from "./aspects/NodejsLambdaEnvValidationAspect";
 *
 *   Aspects.of(stack).add(new NodejsLambdaEnvValidationAspect({
 *     rootDir: __dirname + "/../..",
 *   }));
 */
export class NodejsLambdaEnvValidationAspect implements IAspect {
    private analyzer: StaticEnvAnalyzer;
    private ignoredVarPatterns: RegExp[];
    private processedFunctions = new Set<string>();

    // Cache analysis results to avoid re-analyzing
    private analysisCache = new Map<string, string[]>();

    constructor(props: NodejsLambdaEnvValidationAspectProps) {
        this.analyzer = new StaticEnvAnalyzer({
            rootDir: props.rootDir,
            pathAliases: props.pathAliases || { "@/": "src/" },
            verbose: props.verbose || false,
        });

        const ignoredVars = props.ignoredVars || DEFAULT_IGNORED_ENV_VARS;
        this.ignoredVarPatterns = patternsToRegex(ignoredVars);
    }

    /**
     * Visit each construct in the CDK tree and validate NodejsFunction constructs
     */
    visit(node: IConstruct): void {
        // Only process NodejsFunction (not DockerImageFunction or other Lambda types)
        if (!(node instanceof nodejs.NodejsFunction)) {
            return;
        }

        // Avoid processing the same function twice
        if (this.processedFunctions.has(node.node.path)) {
            return;
        }
        this.processedFunctions.add(node.node.path);

        this.validateLambdaFunction(node);
    }

    private validateLambdaFunction(
        lambdaFunction: nodejs.NodejsFunction
    ): void {
        // Try to extract entry point from the function's code configuration
        const entry = findLambdaEntryPoint(lambdaFunction);

        if (!entry) {
            const errorMessage = [
                "",
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                `❌ ${lambdaFunction.node.id} - Cannot Extract Entry Point`,
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                "",
                "Unable to determine the Lambda function entry point from the CDK construct.",
                "This is required for static analysis of environment variable usage.",
                "",
                "This usually means the function's internal structure is not accessible during synthesis.",
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                "",
            ].join("\n");

            console.error(errorMessage);
            process.exit(1);
        }

        // Check cache first
        let requiredVars: string[];
        if (this.analysisCache.has(entry)) {
            requiredVars = this.analysisCache.get(entry)!;
        } else {
            // Analyze the source code
            const result = this.analyzer.analyze(entry);
            requiredVars = result.requiredEnvVars;

            // Cache the result
            this.analysisCache.set(entry, requiredVars);
        }

        // Get configured environment variables
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const configuredEnv = (lambdaFunction as any).environment || {};
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const configured = Object.keys(configuredEnv);

        // Filter out ignored vars from requirements
        const filteredRequired = requiredVars.filter(
            (v) => !this.shouldIgnore(v)
        );

        // Find missing vars
        const missing = filteredRequired.filter((v) => !configured.includes(v));

        if (missing.length > 0) {
            const errorMessage = formatValidationError(
                lambdaFunction.node.id,
                entry,
                filteredRequired,
                configured
            );

            // Print clean error message without stack trace
            console.error(errorMessage);
            process.exit(1);
        }

        // Success - validation passed silently
    }

    private shouldIgnore(envVar: string): boolean {
        return this.ignoredVarPatterns.some((pattern) => pattern.test(envVar));
    }
}
