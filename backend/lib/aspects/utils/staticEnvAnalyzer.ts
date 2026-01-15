import * as fs from "fs";
import * as path from "path";

interface AnalysisResult {
    requiredEnvVars: string[];
    visitedFiles: string[];
    importChain: Map<string, string[]>; // envVar -> files where it's used
}

interface AnalyzerOptions {
    rootDir: string;
    pathAliases?: Record<string, string>;
    verbose?: boolean;
}

/**
 * Static analyzer that traverses the import tree starting from an entry point
 * and extracts all requireEnvVar() calls.
 *
 * This works by:
 * 1. Reading the entry file
 * 2. Finding all import/export statements
 * 3. Resolving those imports to absolute file paths
 * 4. Recursively analyzing those files
 * 5. Extracting all requireEnvVar() calls along the way
 */
export class StaticEnvAnalyzer {
    private visitedFiles = new Set<string>();
    private envVarUsage = new Map<string, string[]>();
    private options: Required<AnalyzerOptions>;

    constructor(options: AnalyzerOptions) {
        this.options = {
            rootDir: options.rootDir,
            /* v8 ignore next 1 -- @preserve */
            pathAliases: options.pathAliases || { "@/": "src/" },
            verbose: options.verbose || false,
        };
    }

    /**
     * Analyze a file and all its dependencies to find required environment variables.
     */
    analyze(entryPoint: string): AnalysisResult {
        this.visitedFiles.clear();
        this.envVarUsage.clear();

        const absolutePath = path.resolve(this.options.rootDir, entryPoint);

        this.analyzeFile(absolutePath);

        const requiredEnvVars = Array.from(this.envVarUsage.keys()).sort();

        return {
            requiredEnvVars,
            visitedFiles: Array.from(this.visitedFiles),
            importChain: this.envVarUsage,
        };
    }

    private analyzeFile(filePath: string): void {
        // Normalize path
        const normalizedPath = path.normalize(filePath);

        // Avoid circular dependencies and re-analysis
        if (this.visitedFiles.has(normalizedPath)) {
            return;
        }

        /* v8 ignore next 3 -- @preserve */
        if (!fs.existsSync(normalizedPath)) {
            return;
        }

        const stats = fs.statSync(normalizedPath);
        /* v8 ignore next 3 -- @preserve */
        if (!stats.isFile()) {
            return;
        }

        this.visitedFiles.add(normalizedPath);

        const content = fs.readFileSync(normalizedPath, "utf-8");

        // Extract requireEnvVar calls
        this.extractEnvVars(content, normalizedPath);

        // Extract and follow imports
        const imports = this.extractImports(content);
        for (const importPath of imports) {
            const resolved = this.resolveImport(normalizedPath, importPath);
            if (resolved) {
                this.analyzeFile(resolved);
            }
        }
    }

    private extractEnvVars(content: string, filePath: string): void {
        // Match: requireEnvVar("VAR") or requireEnvVar('VAR')
        const regex = /requireEnvVar\(\s*["']([^"']+)["']\s*\)/g;
        const relativePath = path.relative(this.options.rootDir, filePath);

        for (const match of content.matchAll(regex)) {
            const envVar = match[1]!;

            /* v8 ignore next 3 -- @preserve */
            if (!this.envVarUsage.has(envVar)) {
                this.envVarUsage.set(envVar, []);
            }

            this.envVarUsage.get(envVar)!.push(relativePath);
        }
    }

    private extractImports(content: string): string[] {
        const patterns = [
            // Match import statements: import ... from "path"
            // Use [\s\S] instead of . to match across newlines
            /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
            // Match export statements: export ... from "path"
            /export\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
            // Match dynamic imports: import("path") or require("path")
            /(?:import|require)\(["']([^"']+)["']\)/g,
        ];

        return patterns.flatMap((regex) =>
            Array.from(content.matchAll(regex), (match) => match[1]!)
        );
    }

    private resolveImport(fromFile: string, importPath: string): string | null {
        // Skip node_modules and built-in modules
        if (!importPath.startsWith(".") && !this.isPathAlias(importPath)) {
            return null;
        }

        const resolvedPath = this.resolveAliasOrRelative(fromFile, importPath);

        // Try different file extensions and index files
        const extensions = ["", ".ts", ".tsx", ".js", ".jsx"];
        const candidates = [
            ...extensions.map((ext) => resolvedPath + ext),
            ...extensions.map((ext) => path.join(resolvedPath, `index${ext}`)),
        ];

        return (
            candidates.find(
                (candidate) =>
                    fs.existsSync(candidate) && fs.statSync(candidate).isFile()
            ) ?? null
        );
    }

    private resolveAliasOrRelative(
        fromFile: string,
        importPath: string
    ): string {
        // Handle path aliases (e.g., @/ -> src/)
        for (const [alias, target] of Object.entries(
            this.options.pathAliases
        )) {
            if (importPath.startsWith(alias)) {
                return path.join(
                    this.options.rootDir,
                    target,
                    importPath.slice(alias.length)
                );
            }
        }

        // Handle relative imports
        /* v8 ignore next 3 -- @preserve */
        return importPath.startsWith(".")
            ? path.resolve(path.dirname(fromFile), importPath)
            : importPath;
    }

    private isPathAlias(importPath: string): boolean {
        return Object.keys(this.options.pathAliases).some((alias) =>
            importPath.startsWith(alias)
        );
    }
}
