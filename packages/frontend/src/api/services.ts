import { apiDelete, apiGet, apiPost, apiPut } from "./floci-client";
import { listS3Buckets as listAwsS3Buckets } from "./aws/s3.api";
import {
  listAlarms as listAwsCloudWatchAlarms,
  listCloudWatchResources as listAwsCloudWatchResources,
  listLogGroups as listAwsCloudWatchLogGroups,
  listMetrics as listAwsCloudWatchMetrics,
} from "./aws/cloudwatch.api";
import { listEksResources } from "./aws/eks.api";
import { listRdsResources } from "./aws/rds.api";
import { getCloudStatus } from "./cloudProxyClient";
import type {
  ConsoleOverview,
  HealthReport,
  ResourceSummary,
  ServiceName,
  ServiceResourceSnapshot,
} from "./types";
import type { CloudProvider, CloudStatus } from "@/types/cloud";

export const SERVICE_META: Array<{
  name: ServiceName;
  displayName: string;
  route: string;
  implemented: boolean;
  resourceLabel: string;
}> = [
  {
    name: "cloudwatch",
    displayName: "CloudWatch",
    route: "/cloudwatch",
    implemented: true,
    resourceLabel: "log groups",
  },
  {
    name: "s3",
    displayName: "S3",
    route: "/s3",
    implemented: true,
    resourceLabel: "buckets",
  },
  {
    name: "sqs",
    displayName: "SQS",
    route: "/sqs",
    implemented: true,
    resourceLabel: "queues",
  },
  {
    name: "lambda",
    displayName: "Lambda",
    route: "/lambda",
    implemented: true,
    resourceLabel: "functions",
  },
  {
    name: "eks",
    displayName: "EKS",
    route: "/eks",
    implemented: true,
    resourceLabel: "clusters",
  },
  {
    name: "dynamodb",
    displayName: "DynamoDB",
    route: "/dynamodb",
    implemented: true,
    resourceLabel: "tables",
  },
  {
    name: "sns",
    displayName: "SNS",
    route: "/sns",
    implemented: true,
    resourceLabel: "topics",
  },
  {
    name: "secretsmanager",
    displayName: "Secrets Manager",
    route: "/secretsmanager",
    implemented: true,
    resourceLabel: "secrets",
  },
  {
    name: "cognito",
    displayName: "Cognito",
    route: "/cognito",
    implemented: false,
    resourceLabel: "user pools",
  },
  {
    name: "rds",
    displayName: "RDS",
    route: "/rds",
    implemented: true,
    resourceLabel: "instances",
  },
  {
    name: "elasticache",
    displayName: "ElastiCache",
    route: "/elasticache",
    implemented: false,
    resourceLabel: "clusters",
  },
  {
    name: "iam",
    displayName: "IAM",
    route: "/iam",
    implemented: false,
    resourceLabel: "roles",
  },
  {
    name: "ssm",
    displayName: "Systems Manager",
    route: "/ssm",
    implemented: false,
    resourceLabel: "parameters",
  },
  {
    name: "kms",
    displayName: "KMS",
    route: "/kms",
    implemented: false,
    resourceLabel: "keys",
  },
];

// ─── Health ───────────────────────────────────────────────────────────────────

type ServiceStatus = "healthy" | "degraded" | "unavailable" | "unknown";

function cloudRuntimeStatus(status: CloudStatus): ServiceStatus {
  if (status.runtime === "reachable") return "healthy";
  if (status.runtime === "unavailable") return "unavailable";
  return "unknown";
}

export async function fetchHealth(
  signal?: AbortSignal,
  cloud: CloudProvider = "aws",
): Promise<HealthReport> {
  const cloudStatus = await getCloudStatus(cloud, signal);
  const implementedStatus = cloudRuntimeStatus(cloudStatus);
  const services = SERVICE_META.map((meta) => ({
    name: meta.name,
    displayName: meta.displayName,
    status: meta.implemented ? implementedStatus : "unknown",
    requestCount: 0,
    errorCount: 0,
  }));
  const implemented = services.filter(
    (svc) => SERVICE_META.find((meta) => meta.name === svc.name)?.implemented,
  );
  const status: ServiceStatus = implemented.some(
    (svc) => svc.status === "unavailable",
  )
    ? "degraded"
    : implemented.some((svc) => svc.status === "healthy")
      ? "healthy"
      : "unknown";
  return {
    status,
    services,
    checkedAt: cloudStatus.checkedAt,
  };
}

async function timedCount(
  service: ServiceName,
  signal?: AbortSignal,
): Promise<ServiceResourceSnapshot> {
  const meta = SERVICE_META.find((item) => item.name === service);
  const displayName = meta?.displayName ?? service;
  const started = performance.now();
  if (!meta?.implemented)
    return { service, displayName, implemented: false, status: "unknown" };
  try {
    const resources = await listServiceResources(service, signal);
    return {
      service,
      displayName,
      implemented: true,
      status: "healthy",
      count: resources.length,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      service,
      displayName,
      implemented: true,
      status: "unavailable",
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

export async function fetchConsoleOverview(
  signal?: AbortSignal,
  cloud: CloudProvider = "aws",
): Promise<ConsoleOverview> {
  const [health, resources, logGroups, alarms, metrics] = await Promise.all([
    fetchHealth(signal, cloud),
    Promise.all(
      ["s3", "sqs", "lambda", "eks", "rds", "dynamodb", "sns"].map((s) =>
        timedCount(s as ServiceName, signal),
      ),
    ),
    listAwsCloudWatchLogGroups(undefined, signal).catch(() => []),
    listAwsCloudWatchAlarms(signal).catch(() => []),
    listAwsCloudWatchMetrics(signal).catch(() => []),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    health,
    resources,
    logGroupCount: logGroups.length,
    alarmCount: alarms.length,
    metricCount: metrics.length,
    totalResourceCount: resources.reduce(
      (sum, svc) => sum + (svc.count ?? 0),
      0,
    ),
  };
}

// ─── Generic resource list ────────────────────────────────────────────────────

export async function listServiceResources(
  service: ServiceName,
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  if (service === "s3") return listAwsS3Buckets(signal);
  if (service === "sqs") return listSqsQueues(signal);
  if (service === "sns") return listSnsTopicResources(signal);
  if (service === "lambda") return listLambdaFunctions(signal);
  if (service === "eks") return listEksResources(signal);
  if (service === "rds") return listRdsResources(signal);
  if (service === "dynamodb") return listDynamoDbTables(signal);
  if (service === "secretsmanager") return listSecretResources(signal);
  if (service === "cloudwatch") return listAwsCloudWatchResources(signal);
  return [];
}

// ─── SQS ──────────────────────────────────────────────────────────────────────

async function listSqsQueues(signal?: AbortSignal): Promise<ResourceSummary[]> {
  const queues = await apiGet<Array<{ name: string; url: string }>>(
    "/sqs/queues",
    "sqs",
    signal,
  );
  return queues.map((q) => ({
    id: q.url,
    name: q.name,
    status: "available",
    metadata: { queueUrl: q.url },
  }));
}

export interface SqsRedrivePolicy {
    deadLetterTargetArn: string
    maxReceiveCount: number
}

export interface SqsQueueAttributes {
    approximateNumberOfMessages?: number
    approximateNumberOfMessagesDelayed?: number
    approximateNumberOfMessagesNotVisible?: number
    createdTimestamp?: number
    lastModifiedTimestamp?: number
    visibilityTimeout?: number
    maximumMessageSize?: number
    messageRetentionPeriod?: number
    receiveMessageWaitTimeSeconds?: number
    delaySeconds?: number
    fifoQueue?: boolean
    contentBasedDeduplication?: boolean
    queueArn?: string
    redrivePolicy?: SqsRedrivePolicy
}

export interface SqsQueueConfig {
  fifo: boolean;
  visibilityTimeout: number;
  messageRetentionPeriod: number;
  contentBasedDeduplication?: boolean;
}

export interface SqsTag {
  key: string;
  value: string;
}

export async function getSqsQueueAttributes(
  queueUrl: string,
  signal?: AbortSignal,
): Promise<SqsQueueAttributes> {
  return apiGet<SqsQueueAttributes>(
    `/sqs/queue/attributes?url=${encodeURIComponent(queueUrl)}`,
    "sqs",
    signal,
  );
}

export async function createSqsQueue(
  name: string,
  config: SqsQueueConfig,
  signal?: AbortSignal,
): Promise<string> {
  const res = await apiPost<{ name: string; url: string }>(
    "/sqs/queues",
    "sqs",
    { name, ...config },
    signal,
  );
  return res.url;
}

export async function deleteSqsQueue(
  queueUrl: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiDelete(
    `/sqs/queue?url=${encodeURIComponent(queueUrl)}`,
    "sqs",
    signal,
  );
}

export async function purgeSqsQueue(
  queueUrl: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiPost("/sqs/queue/purge", "sqs", { url: queueUrl }, signal);
}

/**
 * FIFO send options. `contentBasedDedup` reflects the queue's setting so the
 * API knows whether it must generate a MessageDeduplicationId.
 */
export interface SqsSendOptions {
    messageGroupId?: string
    contentBasedDedup?: boolean
}

export async function sendSqsMessage(
    queueUrl: string,
    messageBody: string,
    options: SqsSendOptions = {},
    signal?: AbortSignal,
): Promise<string> {
    const res = await apiPost<{messageId: string}>('/sqs/queue/message', 'sqs', {
        url: queueUrl,
        messageBody,
        ...options,
    }, signal)
    return res.messageId
}

export interface SqsMessage {
  messageId: string;
  receiptHandle: string;
  body: string;
  sentTimestamp?: number;
  receiveCount?: number;
}

export async function peekSqsMessages(
  queueUrl: string,
  max = 10,
  signal?: AbortSignal,
): Promise<SqsMessage[]> {
  return apiGet<SqsMessage[]>(
    `/sqs/queue/messages?url=${encodeURIComponent(queueUrl)}&max=${max}`,
    "sqs",
    signal,
  );
}

export async function deleteSqsMessage(
  queueUrl: string,
  receiptHandle: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiPost(
    "/sqs/queue/message/delete",
    "sqs",
    { url: queueUrl, receiptHandle },
    signal,
  );
}

export async function getSqsQueueTags(
  queueUrl: string,
  signal?: AbortSignal,
): Promise<SqsTag[]> {
  return apiGet<SqsTag[]>(
    `/sqs/queue/tags?url=${encodeURIComponent(queueUrl)}`,
    "sqs",
    signal,
  );
}

export async function setSqsQueueTags(
  queueUrl: string,
  tags: SqsTag[],
  signal?: AbortSignal,
): Promise<void> {
  await apiPut("/sqs/queue/tags", "sqs", { url: queueUrl, tags }, signal);
}

export async function removeSqsQueueTags(
  queueUrl: string,
  keys: string[],
  signal?: AbortSignal,
): Promise<void> {
  await apiPost(
    "/sqs/queue/tags/delete",
    "sqs",
    { url: queueUrl, keys },
    signal,
  );
}

export interface SqsBatchResult {
    successful: Array<{id: string; messageId: string}>
    failed: Array<{id: string; message: string}>
}

export async function sendSqsMessageBatch(
    queueUrl: string,
    messages: string[],
    options: SqsSendOptions = {},
    signal?: AbortSignal,
): Promise<SqsBatchResult> {
    return apiPost<SqsBatchResult>('/sqs/queue/messages/batch', 'sqs', {
        url: queueUrl,
        messages,
        ...options,
    }, signal)
}

export async function setSqsQueueAttributes(
    queueUrl: string,
    attributes: Record<string, string>,
    signal?: AbortSignal,
): Promise<void> {
    await apiPut('/sqs/queue/attributes', 'sqs', {url: queueUrl, attributes}, signal)
}

export interface SqsMoveTask {
    status?: string
    approximateNumberOfMessagesMoved?: number
    approximateNumberOfMessagesToMove?: number
    startedTimestamp?: number
    failureReason?: string
}

export async function startSqsRedrive(sourceArn: string, signal?: AbortSignal): Promise<{taskHandle: string}> {
    return apiPost<{taskHandle: string}>('/sqs/queue/redrive', 'sqs', {sourceArn}, signal)
}

export async function listSqsMoveTasks(sourceArn: string, signal?: AbortSignal): Promise<SqsMoveTask[]> {
    return apiGet<SqsMoveTask[]>(`/sqs/queue/redrive/tasks?sourceArn=${encodeURIComponent(sourceArn)}`, 'sqs', signal)
}

/** Queues that send their failed messages to this queue (i.e. use it as a DLQ). */
export async function listSqsDeadLetterSources(
    queueUrl: string,
    signal?: AbortSignal,
): Promise<Array<{name: string; url: string}>> {
    return apiGet<Array<{name: string; url: string}>>(
        `/sqs/queue/dlq-sources?url=${encodeURIComponent(queueUrl)}`, 'sqs', signal,
    )
}

// ─── SNS ──────────────────────────────────────────────────────────────────────

export interface SnsTopic {
  arn: string;
  name: string;
  fifo: boolean;
}

export interface SnsSubscription {
  subscriptionArn: string;
  protocol: string;
  endpoint: string;
  topicArn: string;
}

export interface SnsTag {
  key: string;
  value: string;
}

async function listSnsTopicResources(
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  const topics = await apiGet<Array<{ name: string; arn: string }>>(
    "/sns/topics",
    "sns",
    signal,
  );
  return topics.map((t) => ({
    id: t.arn,
    name: t.name,
    status: "available",
    metadata: { arn: t.arn },
  }));
}

export async function listSnsTopicsDetail(
  signal?: AbortSignal,
): Promise<SnsTopic[]> {
  return apiGet<SnsTopic[]>("/sns/topics", "sns", signal);
}

export async function createSnsTopic(
  name: string,
  fifo: boolean,
  signal?: AbortSignal,
): Promise<SnsTopic> {
  return apiPost<SnsTopic>("/sns/topics", "sns", { name, fifo }, signal);
}

export async function deleteSnsTopic(
  arn: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiDelete(`/sns/topics?arn=${encodeURIComponent(arn)}`, "sns", signal);
}

export async function listSubscriptionsByTopic(
  topicArn: string,
  signal?: AbortSignal,
): Promise<SnsSubscription[]> {
  return apiGet<SnsSubscription[]>(
    `/sns/subscriptions?topicArn=${encodeURIComponent(topicArn)}`,
    "sns",
    signal,
  );
}

export async function subscribeToTopic(
  topicArn: string,
  protocol: string,
  endpoint: string,
  signal?: AbortSignal,
): Promise<{ subscriptionArn: string }> {
  return apiPost<{ subscriptionArn: string }>(
    "/sns/subscriptions",
    "sns",
    { topicArn, protocol, endpoint },
    signal,
  );
}

export async function unsubscribeFromTopic(
  subscriptionArn: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiDelete(
    `/sns/subscriptions?arn=${encodeURIComponent(subscriptionArn)}`,
    "sns",
    signal,
  );
}

export async function publishSnsMessage(
  topicArn: string,
  message: string,
  subject?: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await apiPost<{ messageId: string }>(
    "/sns/publish",
    "sns",
    { topicArn, message, subject },
    signal,
  );
  return res.messageId;
}

export async function getSnsTopicAttributes(
  topicArn: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  return apiGet<Record<string, string>>(
    `/sns/topics/attributes?arn=${encodeURIComponent(topicArn)}`,
    "sns",
    signal,
  );
}

export async function listSnsTopicTags(
  topicArn: string,
  signal?: AbortSignal,
): Promise<SnsTag[]> {
  return apiGet<SnsTag[]>(
    `/sns/topics/tags?arn=${encodeURIComponent(topicArn)}`,
    "sns",
    signal,
  );
}

export async function setSnsTopicTags(
  topicArn: string,
  tags: SnsTag[],
  signal?: AbortSignal,
): Promise<void> {
  await apiPut("/sns/topics/tags", "sns", { arn: topicArn, tags }, signal);
}

export async function removeSnsTopicTags(
  topicArn: string,
  keys: string[],
  signal?: AbortSignal,
): Promise<void> {
  await apiPost(
    "/sns/topics/tags/delete",
    "sns",
    { arn: topicArn, keys },
    signal,
  );
}

// ─── Lambda ───────────────────────────────────────────────────────────────────

export interface LambdaInvokeResult {
  statusCode: number;
  payload: string;
  functionError?: string;
  logResult?: string;
  executionDuration?: number;
}

async function listLambdaFunctions(
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  const fns = await apiGet<
    Array<{
      name: string;
      arn?: string;
      runtime?: string;
      handler?: string;
      state?: string;
      lastModified?: string;
      memorySize?: number;
      timeout?: number;
      codeSize?: number;
      packageType?: string;
      description?: string;
    }>
  >("/lambda/functions", "lambda", signal);
  return fns.map((fn) => ({
    id: fn.arn ?? fn.name,
    name: fn.name,
    status: fn.state ?? "Active",
    description: fn.description ?? fn.handler,
    metadata: {
      runtime: fn.runtime,
      handler: fn.handler,
      memoryMb: fn.memorySize,
      timeoutSec: fn.timeout,
      codeSize: fn.codeSize,
      packageType: fn.packageType,
      lastModified: fn.lastModified,
    },
  }));
}

export interface LambdaFunctionConfig {
  name: string;
  functionArn?: string;
  runtime?: string;
  handler?: string;
  state?: string;
  stateReason?: string;
  lastModified?: string;
  memorySize?: number;
  timeout?: number;
  codeSize?: number;
  packageType?: string;
  description?: string;
  architectures?: string[];
  role?: string;
  environment?: Record<string, string>;
}

export async function getLambdaFunction(
  name: string,
  signal?: AbortSignal,
): Promise<LambdaFunctionConfig> {
  return apiGet<LambdaFunctionConfig>(
    `/lambda/functions/${encodeURIComponent(name)}`,
    "lambda",
    signal,
  );
}

export async function invokeLambdaFunction(
  name: string,
  payload: string,
  signal?: AbortSignal,
): Promise<LambdaInvokeResult> {
  return apiPost<LambdaInvokeResult>(
    `/lambda/functions/${encodeURIComponent(name)}/invoke`,
    "lambda",
    { payload },
    signal,
  );
}

export async function deleteLambdaFunction(
  name: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiDelete(
    `/lambda/functions/${encodeURIComponent(name)}`,
    "lambda",
    signal,
  );
}

// ─── DynamoDB ─────────────────────────────────────────────────────────────────

export interface DynamoDbKeyAttr {
  name: string;
  keyType: "HASH" | "RANGE";
  attrType: "S" | "N" | "B";
}

export type DynamoDbItem = Record<string, unknown>;

async function listDynamoDbTables(
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  const tables = await apiGet<
    Array<{
      name: string;
      arn?: string;
      status?: string;
      itemCount?: number;
      sizeBytes?: number;
      billingMode?: string;
      createdAt?: string;
      keySchema?: DynamoDbKeyAttr[];
    }>
  >("/dynamodb/tables", "dynamodb", signal);
  return tables.map((t) => ({
    id: t.arn ?? t.name,
    name: t.name,
    status: t.status ?? "unknown",
    metadata: {
      itemCount: t.itemCount,
      sizeBytes: t.sizeBytes,
      billingMode: t.billingMode,
      createdAt: t.createdAt,
      keySchema: t.keySchema,
    },
  }));
}

export async function scanDynamoDbTable(
  tableName: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<{ items: DynamoDbItem[]; count: number; scannedCount: number }> {
  return apiGet(
    `/dynamodb/${encodeURIComponent(tableName)}/items?limit=${limit}`,
    "dynamodb",
    signal,
  );
}

export async function queryDynamoDbTable(
  tableName: string,
  pkName: string,
  pkValue: string | number,
  skName?: string,
  skOperator?: string,
  skValue?: string | number,
  skValue2?: string | number,
  limit = 50,
  signal?: AbortSignal,
): Promise<{ items: DynamoDbItem[]; count: number; scannedCount: number }> {
  const params = new URLSearchParams({
    pkName,
    pkValue: String(pkValue),
    limit: String(limit),
  });
  if (skName) params.set("skName", skName);
  if (skOperator) params.set("skOperator", skOperator);
  if (skValue !== undefined) params.set("skValue", String(skValue));
  if (skValue2 !== undefined) params.set("skValue2", String(skValue2));
  return apiGet(
    `/dynamodb/${encodeURIComponent(tableName)}/items/query?${params}`,
    "dynamodb",
    signal,
  );
}

export async function createDynamoDbTable(
  name: string,
  pk: { name: string; type: string },
  sk?: { name: string; type: string },
  billingMode?: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiPost(
    "/dynamodb/tables",
    "dynamodb",
    { name, pk, sk, billingMode },
    signal,
  );
}

export async function deleteDynamoDbTable(
  name: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiDelete(`/dynamodb/${encodeURIComponent(name)}`, "dynamodb", signal);
}

export async function putDynamoDbItem(
  tableName: string,
  item: DynamoDbItem,
  signal?: AbortSignal,
): Promise<void> {
  await apiPut(
    `/dynamodb/${encodeURIComponent(tableName)}/items`,
    "dynamodb",
    { item },
    signal,
  );
}

export async function deleteDynamoDbItem(
  tableName: string,
  key: DynamoDbItem,
  signal?: AbortSignal,
): Promise<void> {
  await apiPost(
    `/dynamodb/${encodeURIComponent(tableName)}/items/delete`,
    "dynamodb",
    { key },
    signal,
  );
}

// ─── Secrets Manager ────────────────────────────────────────────────────────────

export interface SecretTag {
  key: string;
  value: string;
}

export interface SecretSummary {
  name: string;
  arn?: string;
  description?: string;
  rotationEnabled: boolean;
  kmsKeyId?: string;
  lastChangedDate?: string;
  lastAccessedDate?: string;
  createdDate?: string;
  tags: SecretTag[];
}

export interface SecretDetail extends SecretSummary {
  deletedDate?: string;
  versionIds: string[];
}

export interface SecretValue {
  name: string;
  arn?: string;
  versionId?: string;
  secretString?: string;
  secretBinary?: string;
  createdDate?: string;
}

async function listSecretResources(
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  const secrets = await listSecrets(signal);
  return secrets.map((s) => ({
    id: s.arn ?? s.name,
    name: s.name,
    status: s.rotationEnabled ? "rotation enabled" : "available",
    description: s.description,
    metadata: {
      lastChangedDate: s.lastChangedDate,
      lastAccessedDate: s.lastAccessedDate,
      createdDate: s.createdDate,
      tagCount: s.tags.length,
    },
  }));
}

export async function listSecrets(
  signal?: AbortSignal,
): Promise<SecretSummary[]> {
  return apiGet<SecretSummary[]>(
    "/secretsmanager/secrets",
    "secretsmanager",
    signal,
  );
}

export async function describeSecret(
  id: string,
  signal?: AbortSignal,
): Promise<SecretDetail> {
  return apiGet<SecretDetail>(
    `/secretsmanager/secret?id=${encodeURIComponent(id)}`,
    "secretsmanager",
    signal,
  );
}

export async function getSecretValue(
  id: string,
  signal?: AbortSignal,
): Promise<SecretValue> {
  return apiGet<SecretValue>(
    `/secretsmanager/secret/value?id=${encodeURIComponent(id)}`,
    "secretsmanager",
    signal,
  );
}

export async function createSecret(
  name: string,
  secretString: string,
  description?: string,
  signal?: AbortSignal,
): Promise<{ name: string; arn?: string; versionId?: string }> {
  return apiPost(
    "/secretsmanager/secrets",
    "secretsmanager",
    { name, secretString, description },
    signal,
  );
}

export async function putSecretValue(
  id: string,
  secretString: string,
  signal?: AbortSignal,
): Promise<{ arn?: string; versionId?: string }> {
  return apiPut(
    "/secretsmanager/secret/value",
    "secretsmanager",
    { id, secretString },
    signal,
  );
}

export async function deleteSecret(
  id: string,
  force = false,
  signal?: AbortSignal,
): Promise<void> {
  const params = new URLSearchParams({ id });
  if (force) params.set("force", "true");
  await apiDelete(
    `/secretsmanager/secret?${params}`,
    "secretsmanager",
    signal,
  );
}
