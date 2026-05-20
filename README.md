# Floci UI

Floci UI is evolving into a unified local-first multi-cloud runtime explorer for
[Floci](https://github.com/floci-io/floci) and compatible local cloud runtimes.

It is designed to feel familiar to AWS Console users while staying honest about the current implementation: the UI only
renders real data returned by Floci-compatible APIs. If a service or operation is not wired yet, the screen stays empty
or shows an explicit placeholder. No fake resources, demo rows, or mock service data are shown in normal mode.

## Why Floci UI?

Floci exposes cloud-compatible APIs that are ideal for SDKs, CLI scripts, and automated tests, but day-to-day local
development also needs a visual layer:

- See which local cloud runtime the UI is connected to.
- Browse real local cloud resources without leaving the browser.
- Inspect service state without inventing resources.
- Use CloudWatch logs and metrics as the telemetry surface.
- Keep unsupported screens explicit instead of hiding gaps behind dummy data.

## Project Vision

Floci UI is moving from an AWS-focused local console toward a metadata-driven explorer that can render multiple local
cloud runtimes through one consistent interface.

The initial unified scope is intentionally small:

- AWS S3 through Floci AWS Core.
- Azure Blob Storage through Floci-AZ.
- GCP appears only as a coming-soon placeholder.

Future scope:

- More AWS services.
- More Azure services.
- GCP support coming soon.
- Plugin/adapters ecosystem.
- Observability and resource inspection.

## Architecture Principle

The rule of the project is:

- The UI does not know clouds.
- The proxy does not know internal implementations.
- The SPI defines the contracts.
- The adapters perform the translation.
- Floci Core executes the runtime.

```mermaid
flowchart LR
    Browser["Browser"]
    UI["floci-ui-web\nReact + TypeScript"]
    Proxy["Cloud Proxy API\n/api/clouds/*"]
    Registry["Cloud Adapter Registry"]
    AWS["AWS Storage Adapter"]
    Azure["Azure Storage Adapter"]
    GCP["GCP Adapter\nComing Soon"]
    FlociAWS["Floci AWS Core\nlocalhost:4566"]
    FlociAZ["Floci-AZ\nlocalhost:4577"]
    Browser --> UI
    UI --> Proxy
    Proxy --> Registry
    Registry --> AWS
    Registry --> Azure
    Registry -. placeholder .-> GCP
    AWS --> FlociAWS
    Azure --> FlociAZ
```

The unified UI talks only to the Cloud Proxy API. The proxy resolves the selected cloud and service through the adapter
registry, then returns normalized resources and metadata schemas back to the web app.

## Architecture

![Floci Unified UI Multi-Cloud Architecture](docs/images/floci-unified-ui-architecture.png)

Short implementation notes are available in [docs/implementation-notes.md](docs/implementation-notes.md).

## Unified Storage Scope

The first metadata-driven service is `storage`.

| Cloud | Runtime | Adapter | Resource mapping | Status |
|---|---|---|---|---|
| AWS | Floci AWS Core | AWS Storage Adapter | S3 bucket -> storage resource | Implemented |
| Azure | Floci-AZ | Azure Storage Adapter | Blob container -> storage resource | Implemented |
| GCP | Future Floci-GP | GCP Adapter | Cloud Storage bucket -> storage resource | Coming soon |

Normalized resource shape:

```json
{
  "id": "string",
  "name": "string",
  "cloud": "aws | azure",
  "service": "storage",
  "type": "bucket | container",
  "region": "string | null",
  "createdAt": "string | null",
  "metadata": {}
}
```

## Current UI Status

These percentages describe UI coverage for the existing AWS-focused service pages, not backend completeness. Floci core
supports more operations than this UI currently exposes.

| Service    | UI coverage | Current UI status                                                                                                                                                                                                                                                            |
|------------|------------:|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| S3         |         95% | Full bucket and object lifecycle. List, create, delete buckets. Browse objects by prefix with folder navigation. Upload, download, delete, bulk-delete, and copy objects. Read object metadata and tags. Read/update bucket tags and versioning.                             |
| DynamoDB   |         95% | Full table lifecycle. List, describe, create, delete tables. Scan with configurable limit. Query by partition key with sort-key operators. Create, edit, and delete items via JSON editor. Key schema badges and typed value rendering.                                      |
| SQS        |        100% | Full queue lifecycle and management. List, create, delete, purge queues. Send single (FIFO-aware) and batch messages. Peek and delete messages. Queue tags. Editable configuration. Dead-letter queue config and redrive.                                                    |
| Lambda     |         90% | Full function detail. List functions, filter by name or runtime. Detail drawer with runtime, state, architecture, ARN, handler, memory, timeout, code size, environment variables. Invoke with JSON payload, response display, and log tail. Delete function.                |
| SNS        |         90% | Full topic lifecycle. List, create (standard and FIFO), delete topics. List and manage subscriptions per topic (sqs, lambda, http, https, email, sms). Subscribe and unsubscribe endpoints. Publish messages with optional subject.                                          |
| CloudWatch |         90% | Full log management. List, filter, create, delete log groups with retention policy. List and delete log streams. Browse and search log events. Rich parsing of Floci ingestor events into HTTP method/status/latency rows. List metrics and alarms. Auto-refresh every 10 s. |

Connected services today:

- CloudWatch
- S3
- SQS
- Lambda
- DynamoDB
- SNS

Placeholder services today:

- Secrets Manager
- Cognito
- RDS
- ElastiCache
- IAM
- Systems Manager
- KMS

## Service Detail

<details>
<summary><strong>S3 — 95%</strong></summary>

### S3

Implemented:

- List buckets.
- Create bucket.
- Delete bucket.
- Browse objects by prefix.
- Folder-style navigation and breadcrumb.
- Create folder placeholders.
- Upload objects.
- Download objects.
- Delete one object.
- Delete multiple selected objects (bulk bar).
- Copy objects.
- Read object metadata (content type, size, ETag, cache-control, encoding).
- Read and update object tags.
- Read and update bucket tags.
- Read and update bucket versioning.

Remaining gaps:

| Feature                  | Floci API availability                                                        |
|--------------------------|-------------------------------------------------------------------------------|
| Object version browser   | Versioning is enabled via UI but listing individual versions is not yet wired |
| Bucket policy management | Available in core if S3 policy endpoints are enabled                          |
| Presigned URL workflow   | Available through AWS-compatible S3 behavior                                  |
| Multipart upload UI      | Available in core, not exposed in UI                                          |

</details>

<details>
<summary><strong>DynamoDB — 95%</strong></summary>

### DynamoDB

Implemented:

- List tables.
- Create table (partition key, optional sort key, PAY_PER_REQUEST or PROVISIONED billing).
- Delete table.
- Describe table metadata (status, item count, size, billing mode, key schema).
- Key schema badges (HASH in amber, RANGE in purple).
- Scan table items with configurable limit.
- Query by partition key with sort-key operators (=, <, <=, >, >=, begins_with, between).
- Dynamic column rendering with typed values (numbers in green, booleans in blue).
- Create item via JSON editor.
- Edit item via JSON editor.
- Delete item with inline confirmation.
- Client-side search filter across all visible rows.

Remaining gaps:

| Feature                     | Floci API availability                                                |
|-----------------------------|-----------------------------------------------------------------------|
| TTL view and update         | `DescribeTimeToLive` / `UpdateTimeToLive`                             |
| Batch write and bulk delete | `BatchWriteItem`                                                      |
| GSI / LSI management        | `UpdateTable`                                                         |
| UpdateItem (partial update) | `UpdateItem` — current edit uses PutItem which replaces the full item |

</details>

<details>
<summary><strong>SQS — 100%</strong></summary>

### SQS

Implemented:

- List queues.
- Create queue (standard and FIFO, content-based deduplication, visibility timeout, retention period).
- Delete queue with inline confirmation.
- Purge queue with inline amber warning.
- Select queue and read attributes.
- Show message counts.
- Edit queue configuration via the Settings tab (visibility timeout, delivery delay, receive wait time, max message
  size, retention).
- Send message — FIFO-aware: a message group id is sent for FIFO queues, and a deduplication id is generated only when
  the queue does not use content-based deduplication.
- Send message batch (up to 10, with an explicit over-limit warning).
- Peek messages without consuming them.
- Delete individual messages after peek.
- Queue tags: list, add, and remove.
- Dead-letter queue configuration: set and clear a redrive policy targeting another queue.
- Dead-letter redrive: list the source queues this queue serves, and start a message move task to send their messages
  back.

Known limitations:

| Feature                        | Status                                                                                                                                                                |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Redrive task history           | Floci core accepts `StartMessageMoveTask`, but its `ListMessageMoveTasks` handler currently returns no results — the task table stays empty until Floci core is fixed |
| Per-message visibility control | `ChangeMessageVisibility` is not yet surfaced                                                                                                                         |

</details>

<details>
<summary><strong>Lambda — 90%</strong></summary>

### Lambda

Implemented:

- List functions.
- Filter by name or runtime.
- Function card grid with runtime, state, handler, memory, timeout, code size, and last modified.
- Detail drawer with "Details" and "Invoke" tabs.
- Details tab: runtime badge, state badge, architecture badge, stateReason, full configuration meta-grid, ARN, role,
  environment variables table.
- Invoke tab: JSON payload editor, invoke button, response display (HTTP status, function error, execution duration),
  log tail collapsible.
- Delete function with inline confirmation in the drawer footer.

Remaining gaps:

| Feature                      | Floci API availability                                     |
|------------------------------|------------------------------------------------------------|
| Create function              | `CreateFunction`                                           |
| Event source mappings        | `ListEventSourceMappings`                                  |
| Aliases                      | `ListAliases`                                              |
| Versions                     | `ListVersionsByFunction`                                   |
| Link to CloudWatch log group | CloudWatch log groups (by convention `/aws/lambda/{name}`) |

</details>

<details>
<summary><strong>CloudWatch — 90%</strong></summary>

### CloudWatch

Implemented:

- List log groups with prefix filter.
- Create log group with optional retention policy.
- Delete log group with inline confirmation.
- Log group list shows stored bytes, creation time, and retention badge.
- List streams for a selected group.
- Delete log stream with inline confirmation.
- Browse log events for a selected stream.
- Search events by message content.
- Rich log event rendering: Floci ingestor JSON events are parsed into HTTP method badge, path, action, status code
  badge, and latency.
- List metrics table (namespace, metric name, dimensions).
- List alarms table (name, state, metric) with expandable overflow.
- Auto-refresh logs, streams, and events every 10 s.
- Contextual header: shows group name and "ingestor" badge when a `/floci/*` group is selected; back arrow to return to
  overview.
- CloudWatch ingestor: automatically captures all Floci API calls into `/floci/{service}` log groups as the user
  navigates the console.

Remaining gaps:

| Feature                     | Floci API availability                                                 |
|-----------------------------|------------------------------------------------------------------------|
| Metric graphing             | `GetMetricStatistics` / `GetMetricData`                                |
| Alarm creation and edit     | `PutMetricAlarm`                                                       |
| Create log stream from UI   | `CreateLogStream` — streams are currently created by the ingestor only |
| Manual PutLogEvents from UI | `PutLogEvents`                                                         |

</details>

<details>
<summary><strong>SNS — 90%</strong></summary>

### SNS

Implemented:

- List topics with name filter.
- Create topic (standard and FIFO, auto-appends `.fifo` suffix).
- Delete topic with inline confirmation.
- Select topic and manage subscriptions.
- List active subscriptions per topic (protocol badge, endpoint).
- Subscribe endpoint with protocol selector (sqs, lambda, http, https, email, email-json, sms).
- Unsubscribe endpoint with inline confirmation.
- Publish message with optional subject, result display with MessageId.
- Informational SNS fanout panel.

Remaining gaps:

| Feature                                              | Floci API availability                                                                 |
|------------------------------------------------------|----------------------------------------------------------------------------------------|
| Topic attributes (display mode, deduplication scope) | `GetTopicAttributes` / `SetTopicAttributes`                                            |
| Topic tags                                           | `TagResource` / `ListTagsForResource`                                                  |
| Subscription confirmation flow                       | Protocol-specific — email/http require confirmation before `SubscriptionArn` is active |
| Subscription filter policies                         | `SetSubscriptionAttributes`                                                            |

</details>

## Setup

### Prerequisites

- Node.js 20 or newer.
- pnpm 9 or newer.
- Bun, required by `packages/api`.
- Docker, if you want to run Floci with the published container image.

### 1. Start Floci core

Floci UI needs a running Floci core server before the API and frontend can load resources.

Terminal 1, using Docker:

```bash
docker run -d --name floci \
  -p 4566:4566 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e FLOCI_DEFAULT_REGION=us-east-1 \
  -u root \
  floci/floci:latest
```

Terminal 1, or using a local clone of `floci-io/floci`:

```bash
git clone https://github.com/floci-io/floci.git ../floci
cd ../floci
./mvnw clean quarkus:dev
```

In both cases, verify Floci core is reachable:

```bash
curl http://localhost:4566/_floci/health
```

For Azure Blob Storage exploration, also run Floci-AZ and expose it at `FLOCI_AZURE_ENDPOINT`
(`http://localhost:4577` by default). Floci-AZ routes Blob Storage requests under an Azure account path;
the local default is `FLOCI_AZURE_ACCOUNT_NAME=devstoreaccount1`.

For local development, the UI needs all three of these components running:

1. Floci core on `http://localhost:4566`.
2. The Floci UI API backend on `http://localhost:3001` via `pnpm dev:api`.
3. The frontend dev server on `http://localhost:3000` via `pnpm dev`.

The frontend expects `/api/*` endpoints from `packages/api`, so running only `pnpm dev` is not enough.

### 2. Install Floci UI dependencies

```bash
pnpm install
```

### 3. Configure local environment

```bash
cp .env.example .env
```

Default `.env` values:

```bash
FLOCI_ENDPOINT=http://localhost:4566
FLOCI_AZURE_ENDPOINT=http://localhost:4577
FLOCI_AZURE_ACCOUNT_NAME=devstoreaccount1
VITE_MOCK_MODE=false
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
PORT=3001
```

`.env.example` already includes `VITE_MOCK_MODE=false` for real Floci usage.

### 4. Start the local API

Terminal 2:

```bash
pnpm dev:api
```

This starts `packages/api` on `http://localhost:3001` and points AWS SDK clients at `FLOCI_ENDPOINT`.

### 5. Start the frontend

Terminal 3:

```bash
pnpm dev
```

Open the UI:

```text
http://127.0.0.1:3000/
```

## Environment

```bash
FLOCI_ENDPOINT=http://localhost:4566
FLOCI_AZURE_ENDPOINT=http://localhost:4577
FLOCI_AZURE_ACCOUNT_NAME=devstoreaccount1
VITE_MOCK_MODE=false
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
PORT=3001
```

Floci credentials can be any non-empty value for local development. They are required because the AWS SDK expects
credentials, but Floci does not require real AWS credentials.

## Verification

```bash
pnpm lint
pnpm type-check
pnpm build
```

## Design Direction

The target experience is a practical AWS-console-style interface:

- Dense, service-oriented navigation.
- Clear connection state in the top bar.
- Real resource counts.
- Dedicated pages for high-usage services.
- Empty states when no resources exist.
- Placeholders when a service is not wired yet.
- No decorative data or fake operational metrics.

## Contributing

When adding service UI, follow these rules:

- Use existing Floci AWS-compatible endpoints.
- Do not add custom backend endpoints just for the UI unless the core project explicitly accepts that contract.
- Prefer real empty states over sample data.
- Keep service status percentages updated in this README.
- Add verification notes for any newly wired operations.

## License

This project follows the Floci ecosystem license.
