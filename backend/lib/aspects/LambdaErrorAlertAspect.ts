import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as sns from "aws-cdk-lib/aws-sns";
import { Duration, IAspect } from "aws-cdk-lib";
import { IConstruct } from "constructs";

export interface LambdaErrorAlertAspectProps {
    alertsTopic: sns.ITopic;
    alarmNamePrefix?: string;
}

/**
 * CDK Aspect that automatically adds error log monitoring to all Lambda functions
 * within a construct. This aspect visits all nodes in the construct tree and
 * adds CloudWatch alarms for any Lambda function that has a log group.
 *
 * Usage:
 *   Aspects.of(construct).add(new LambdaErrorAlertAspect({
 *     alertsTopic: myTopic,
 *     alarmNamePrefix: 'MyConstruct'
 *   }));
 *
 * This will automatically discover and monitor ALL Lambda functions in the construct,
 * including any added in the future.
 *
 * SCOPING: The aspect is scoped to ONLY the construct it's applied to and its children.
 * It will NOT affect Lambda functions in sibling or parent constructs.
 */
export class LambdaErrorAlertAspect implements IAspect {
    private readonly alertsTopic: sns.ITopic;
    private readonly alarmNamePrefix: string;
    private readonly processedFunctions = new Set<string>();

    constructor(props: LambdaErrorAlertAspectProps) {
        this.alertsTopic = props.alertsTopic;
        this.alarmNamePrefix = props.alarmNamePrefix || "Lambda";
    }

    /**
     * Visits a construct node and adds error monitoring if it's a Lambda function.
     *
     * IMPORTANT: This aspect is scoped to only the construct where it's applied via
     * Aspects.of(construct).add(). It will NOT affect Lambda functions in other constructs.
     * @param {IConstruct} node - The construct node to visit (automatically called by CDK)
     * @returns {void}
     */
    public visit(node: IConstruct): void {
        // Check if node is a Lambda Function with a logGroup
        if (node instanceof lambda.Function) {
            const lambdaFunction = node;

            // Avoid processing the same function twice
            if (this.processedFunctions.has(lambdaFunction.node.path)) {
                return;
            }
            this.processedFunctions.add(lambdaFunction.node.path);

            // Check if the Lambda has a logGroup (NodejsFunction and DockerImageFunction have this)
            // Try to get logGroup from either NodejsFunction or DockerImageFunction
            const logGroup =
                (lambdaFunction as nodejs.NodejsFunction).logGroup ??
                (lambdaFunction as lambda.DockerImageFunction).logGroup;

            if (!logGroup) {
                return;
            }

            // Skip custom resources (e.g., BucketDeployment custom resources)
            // Custom resources have IDs starting with "Custom::"
            const functionName = node.node.id;
            if (functionName.startsWith("Custom::")) {
                return;
            }

            // Create metric filter for ERROR logs
            // Only matches when the "level" field is "ERROR"
            logGroup.addMetricFilter(
                `ErrorOnLogs-MetricFilter-${functionName}`,
                {
                    metricName: `ErrorOnLogs-${functionName}`,
                    metricNamespace: "Lambda/ErrorOnLogs",
                    filterPattern: logs.FilterPattern.stringValue(
                        "$.level",
                        "=",
                        "ERROR"
                    ),
                    metricValue: "1",
                    defaultValue: 0,
                }
            );

            // Create the metric
            const errorMetric = new cloudwatch.Metric({
                metricName: `ErrorOnLogs-${functionName}`,
                namespace: "Lambda/ErrorOnLogs",
                statistic: "Sum",
                period: Duration.minutes(1),
            });

            // Create the alarm with configurable name
            const errorAlarm = new cloudwatch.Alarm(node, `ErrorOnLogs-Alarm`, {
                metric: errorMetric,
                threshold: 1,
                evaluationPeriods: 1,
                alarmName: `${this.alarmNamePrefix}-ErrorOnLogs-${functionName}`,
                alarmDescription: `ERROR log detected in ${this.alarmNamePrefix} Lambda function: ${functionName}`,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });

            // Add SNS actions
            const alertsSNSAction = new cloudwatchActions.SnsAction(
                this.alertsTopic
            );
            errorAlarm.addAlarmAction(alertsSNSAction);
        }
    }
}
