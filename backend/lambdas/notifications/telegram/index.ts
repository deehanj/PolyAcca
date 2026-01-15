/**
 * Telegram Notification Lambda
 *
 * Receives SNS notifications from CloudWatch Alarms and sends them to Telegram.
 * Triggered by SNS topic subscriptions for:
 * - Lambda error log alerts
 * - SQS DLQ message alerts
 */

import type { SNSEvent, SNSEventRecord } from 'aws-lambda';
import { requireEnvVar } from '../../utils/envVars';

// Environment variables - validated at module load time
const TELEGRAM_BOT_TOKEN = requireEnvVar('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = requireEnvVar('TELEGRAM_CHAT_ID');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

/**
 * CloudWatch Alarm message structure
 */
interface CloudWatchAlarmMessage {
  AlarmName: string;
  AlarmDescription?: string;
  AWSAccountId: string;
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  StateChangeTime: string;
  Region: string;
  OldStateValue?: string;
  Trigger?: {
    MetricName: string;
    Namespace: string;
    Dimensions?: Array<{ name: string; value: string }>;
  };
}

/**
 * Format CloudWatch alarm as Telegram message
 */
function formatAlarmMessage(alarm: CloudWatchAlarmMessage): string {
  const emoji = alarm.NewStateValue === 'ALARM' ? '🚨' : alarm.NewStateValue === 'OK' ? '✅' : '⚠️';
  const status = alarm.NewStateValue;

  const lines = [
    `${emoji} *${escapeMarkdown(alarm.AlarmName)}*`,
    `Status: \`${status}\``,
    `Region: ${alarm.Region}`,
    '',
    alarm.AlarmDescription ? `_${escapeMarkdown(alarm.AlarmDescription)}_` : '',
    '',
    `Reason: ${escapeMarkdown(alarm.NewStateReason)}`,
    '',
    `Time: ${alarm.StateChangeTime}`,
  ];

  return lines.filter(Boolean).join('\n');
}

/**
 * Escape special characters for Telegram MarkdownV2
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Send message to Telegram
 */
async function sendTelegramMessage(message: string): Promise<void> {
  const response = await fetch(TELEGRAM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'MarkdownV2',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram API error: ${response.status} - ${errorBody}`);
  }
}

/**
 * Process a single SNS record
 */
async function processRecord(record: SNSEventRecord): Promise<void> {
  const message = record.Sns.Message;

  try {
    // Try to parse as CloudWatch Alarm message
    const alarm: CloudWatchAlarmMessage = JSON.parse(message);

    if (alarm.AlarmName) {
      const formattedMessage = formatAlarmMessage(alarm);
      await sendTelegramMessage(formattedMessage);
      console.log('Sent Telegram notification for alarm:', alarm.AlarmName);
      return;
    }
  } catch {
    // Not a CloudWatch alarm message, send raw
  }

  // Send raw message if not a recognizable format
  const rawMessage = `📬 *SNS Notification*\n\n\`\`\`\n${escapeMarkdown(message)}\n\`\`\``;
  await sendTelegramMessage(rawMessage);
  console.log('Sent raw Telegram notification');
}

/**
 * Lambda handler - processes SNS events
 */
export async function handler(event: SNSEvent): Promise<void> {
  console.log('Processing SNS records:', event.Records.length);

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error('Error processing SNS record:', error);
      // Don't throw - continue processing other records
    }
  }
}
