# Lambda Environment Variable Validation

This aspect automatically validates that all Lambda functions have the environment variables they need based on static analysis of their code.

## How It Works

1. **Static Analysis**: Traverses the import tree starting from each Lambda's entry point
2. **Extract Requirements**: Finds all `requireEnvVar()` calls across the entire dependency graph
3. **Validation**: Compares required vars against the Lambda's configured environment
4. **Fail Fast**: Throws an error at `cdk synth` time if any vars are missing

## Integration

### Option 1: Apply to Entire Stack (Recommended)

Add to the end of your stack constructor:

```typescript
// lib/stacks/mobileAppApi/MobileAppAPIStack.ts
import { Aspects } from "aws-cdk-lib";
import { NodejsLambdaEnvValidationAspect } from "../../aspects/NodejsLambdaEnvValidationAspect";
import { repoPath } from "../../path";

export class MobileAppAPIStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: MobileAppAPIStackProps) {
        super(scope, id, props);

        // ... all your construct creation ...

        // Add validation aspect at the end
        Aspects.of(this).add(
            new NodejsLambdaEnvValidationAspect({
                rootDir: repoPath(""),
                pathAliases: { "@/": "src/" },
                verbose: false, // Set to true for detailed logging
            })
        );
    }
}
```

### Option 2: Apply to Specific Construct

Validate only Lambdas in a specific construct:

```typescript
// lib/stacks/mobileAppApi/constructs/AvatarConstruct.ts
import { Aspects } from "aws-cdk-lib";
import { NodejsLambdaEnvValidationAspect } from "../../../aspects/NodejsLambdaEnvValidationAspect";
import { repoPath } from "../../../path";

export class AvatarConstruct extends Construct {
    constructor(scope: Construct, id: string, props: AvatarConstructProps) {
        super(scope, id);

        // ... create all your Lambdas ...

        // Validate only this construct's Lambdas
        Aspects.of(this).add(
            new NodejsLambdaEnvValidationAspect({
                rootDir: repoPath(""),
            })
        );
    }
}
```

## Example Output

### Success Case

```
🔍 Static analysis starting from: src/aws/lambda/avatars/selectAvatarFn.ts
  📄 Analyzing: src/aws/lambda/avatars/selectAvatarFn.ts
    🔑 Found: requireEnvVar("AVATARS_BUCKET")
    🔑 Found: requireEnvVar("CLOUDFRONT_DISTRIBUTION_ID")
    🔑 Found: requireEnvVar("USERS_TABLE")
  📄 Analyzing: src/aws/lambda/users/utils/index.ts
  📄 Analyzing: src/aws/lambda/users/utils/userRepository.ts
✅ Analysis complete. Found 3 env vars across 12 files
✅ SelectAvatarFunction: AVATARS_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, USERS_TABLE
```

### Failure Case

```
🔍 Static analysis starting from: src/aws/lambda/avatars/selectAvatarFn.ts
  📄 Analyzing: src/aws/lambda/avatars/selectAvatarFn.ts
    🔑 Found: requireEnvVar("AVATARS_BUCKET")
  📄 Analyzing: src/aws/lambda/users/utils/cognitoUtils.ts
  📄 Analyzing: src/aws/cognito/cognitoIDP.factory.ts
  📄 Analyzing: src/aws/sts/stsAdminActions.ts
    🔑 Found: requireEnvVar("STADION_ADMIN_ACTIONS_ROLE_ARN")
    🔑 Found: requireEnvVar("STADION_ADMIN_ACTIONS_EXTERNAL_ID")
✅ Analysis complete. Found 5 env vars across 18 files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Lambda Environment Variable Validation Failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Function: SelectAvatarFunction
Entry:    src/aws/lambda/avatars/selectAvatarFn.ts

Required environment variables (from static analysis):
  • AVATARS_BUCKET
  • CLOUDFRONT_DISTRIBUTION_ID
  • USERS_TABLE
  • STADION_ADMIN_ACTIONS_ROLE_ARN
  • STADION_ADMIN_ACTIONS_EXTERNAL_ID

Configured environment variables:
  • AVATARS_BUCKET
  • CLOUDFRONT_DISTRIBUTION_ID
  • USERS_TABLE
  • NODE_OPTIONS

⚠️  MISSING:
  • STADION_ADMIN_ACTIONS_ROLE_ARN
  • STADION_ADMIN_ACTIONS_EXTERNAL_ID

These environment variables are required by requireEnvVar() calls
somewhere in this Lambda's code or its dependencies.

To fix this, add the missing variables to the Lambda's environment
configuration in your CDK construct.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Subprocess exited with error 1
```

## Configuration Options

```typescript
interface NodejsLambdaEnvValidationAspectProps {
    /**
     * Root directory of the project (usually the repo root)
     */
    rootDir: string;

    /**
     * Path aliases from tsconfig (e.g., { "@/": "src/" })
     * Default: { "@/": "src/" }
     */
    pathAliases?: Record<string, string>;

    /**
     * Environment variables to ignore during validation.
     * These are typically provided by the Lambda runtime or are optional.
     *
     * Default: ["NODE_OPTIONS", "AWS_EXECUTION_ENV", "AWS_LAMBDA_*"]
     */
    ignoredVars?: string[];

    /**
     * Enable verbose logging during analysis
     * Default: false
     */
    verbose?: boolean;
}
```

## Common Issues and Solutions

### Issue: "Stadion env vars required but not needed"

**Problem**: Lambda transitively imports Cognito code that requires Stadion credentials, even though the Lambda doesn't use them.

**Example**: `selectAvatarFn` imports from `users/utils` which transitively imports `stsAdminActions`.

**Solutions**:

1. **Refactor imports** (recommended): Split barrel files to avoid importing unnecessary code
2. **Add the vars**: Include the vars even if unused (not ideal but quick)
3. **Lazy loading**: Move imports inside functions to avoid top-level loading

### Issue: False positives

If the analyzer detects vars that shouldn't be required, you can:

1. Add them to `ignoredVars`
2. Use conditional imports to avoid loading code paths
3. File an issue if it's a bug in the analyzer

## Performance

- **Analysis**: ~100-500ms per Lambda (cached after first run)
- **Synth time impact**: Minimal (1-2 seconds for 20+ Lambdas)
- **Cache**: Results are cached per entry point within a single synth

## Testing

To test without deploying:

```bash
npm run cdk synth
```

The validation runs during synthesis, so you'll see errors immediately.
