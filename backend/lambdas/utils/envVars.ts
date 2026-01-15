/**
 * Get the value of an environment variable, or throw.
 *
 * This function can only be called at the top-level of a module, to ensure all
 * necessary env vars are validated on process start-up.
 */
export function requireEnvVar(envVarName: string): string {
    // eslint-disable-next-line no-restricted-syntax
    const envVarValue = process.env[envVarName];
    if (envVarValue === undefined || envVarValue === "") {
        throw new Error(`Missing env var '${envVarName}'`);
    }
    return envVarValue;
}

/**
 * Get the value of an optional environment variable.
 *
 * This can be called anywhere, which allows test cases to set optional env
 * vars to override things like API client base URLs.
 */
export function optionalEnvVar(envVarName: string): string | undefined {
    // eslint-disable-next-line no-restricted-syntax
    return process.env[envVarName];
}
