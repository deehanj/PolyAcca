import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import { Duration, IAspect } from "aws-cdk-lib";
import { IConstruct } from "constructs";

export interface SqsDlqAlertAspectProps {
    alertsTopic: sns.ITopic;
    alarmNamePrefix?: string;
    messageThreshold?: number;
    evaluationPeriodMinutes?: number;
}

/**
 * CDK Aspect that automatically adds CloudWatch alarms to Dead Letter Queues (DLQs).
 * When messages appear in a DLQ, it indicates processing failures that need attention.
 *
 * Usage:
 *   Aspects.of(construct).add(new SqsDlqAlertAspect({
 *     alertsTopic: myTopic,
 *     alarmNamePrefix: 'MyConstruct'
 *   }));
 *
 * This will automatically discover and monitor ALL DLQs in the construct,
 * including any added in the future.
 *
 * SCOPING: The aspect is scoped to ONLY the construct it's applied to and its children.
 * It will NOT affect DLQs in sibling or parent constructs.
 */
export class SqsDlqAlertAspect implements IAspect {
    private readonly alertsTopic: sns.ITopic;
    private readonly alarmNamePrefix: string;
    private readonly messageThreshold: number;
    private readonly evaluationPeriodMinutes: number;
    private readonly processedQueues = new Set<string>();

    constructor(props: SqsDlqAlertAspectProps) {
        this.alertsTopic = props.alertsTopic;
        this.alarmNamePrefix = props.alarmNamePrefix || "SQS";
        this.messageThreshold = props.messageThreshold ?? 1;
        this.evaluationPeriodMinutes = props.evaluationPeriodMinutes ?? 1;
    }

    /**
     * Visits a construct node and adds DLQ monitoring if it's an SQS Queue
     * that appears to be a Dead Letter Queue.
     *
     * IMPORTANT: This aspect is scoped to only the construct where it's applied via
     * Aspects.of(construct).add(). It will NOT affect queues in other constructs.
     * @param {IConstruct} node - The construct node to visit (automatically called by CDK)
     * @returns {void}
     */
    public visit(node: IConstruct): void {
        // Check if node is an SQS Queue
        if (node instanceof sqs.Queue) {
            const queue = node;

            // Avoid processing the same queue twice
            if (this.processedQueues.has(queue.node.path)) {
                return;
            }
            this.processedQueues.add(queue.node.path);

            // Check if this is a DLQ by looking at the construct ID
            // Common patterns: "DLQ", "DeadLetterQueue", "dlq", etc.
            const queueId = queue.node.id.toLowerCase();
            const isDLQ =
                queueId.includes("dlq") ||
                queueId.includes("deadletter") ||
                queueId.includes("dead-letter");

            if (!isDLQ) {
                return;
            }

            // Create a friendly name from the construct ID
            const queueName = node.node.id;

            // Create metric for ApproximateNumberOfMessagesVisible
            const messagesMetric =
                queue.metricApproximateNumberOfMessagesVisible({
                    statistic: "Maximum",
                    period: Duration.minutes(this.evaluationPeriodMinutes),
                });

            // Create the alarm
            const dlqAlarm = new cloudwatch.Alarm(node, "DLQMessagesAlarm", {
                metric: messagesMetric,
                threshold: this.messageThreshold,
                evaluationPeriods: 1,
                alarmName: `${this.alarmNamePrefix}-DLQ-${queueName}`,
                alarmDescription: `Messages detected in Dead Letter Queue: ${queueName}. This indicates processing failures that need investigation.`,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
                comparisonOperator:
                    cloudwatch.ComparisonOperator
                        .GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            });

            // Add SNS action for Slack notifications
            const alertsSNSAction = new cloudwatchActions.SnsAction(
                this.alertsTopic
            );
            dlqAlarm.addAlarmAction(alertsSNSAction);
        }
    }
}
