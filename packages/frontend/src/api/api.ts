import { EndpointRegistry, HttpClient } from "./HttpClient";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required before calling the API.");
    this.name = "AuthenticationRequiredError";
  }
}

export const apiEndpointKeys = {
  clouds: {
    list: "clouds.list",
    services: "clouds.services.list",
    status: "clouds.status.get",
    schema: "clouds.services.schema.get",
    resources: {
      list: "clouds.services.resources.list",
      get: "clouds.services.resources.get",
      create: "clouds.services.resources.create",
      delete: "clouds.services.resources.delete",
    },
    storage: {
      objects: {
        list: "clouds.services.storage.objects.list",
        upload: "clouds.services.storage.objects.upload",
        download: "clouds.services.storage.objects.download",
        delete: "clouds.services.storage.objects.delete",
      },
    },
  },
  aws: {
    s3: {
      buckets: {
        list: "aws.s3.buckets.list",
        create: "aws.s3.buckets.create",
        delete: "aws.s3.buckets.delete",
        getBucketTagging: "aws.s3.buckets.get-bucket-tagging",
        getBucketVersioning: "aws.s3.buckets.get-bucket-versioning",
        versioning: {
          get: "aws.s3.buckets.get-bucket-versioning",
          put: "aws.s3.buckets.versioning.put",
        },
        tags: {
          get: "aws.s3.buckets.get-bucket-tagging",
          put: "aws.s3.buckets.tags.put",
        },
      },
      objects: {
        list: "aws.s3.objects.list",
        upload: "aws.s3.objects.upload",
        delete: "aws.s3.objects.delete",
        deleteMany: "aws.s3.objects.delete-many",
        copy: "aws.s3.objects.copy",
        metadata: "aws.s3.objects.metadata",
        tags: {
          get: "aws.s3.objects.tags.get",
          put: "aws.s3.objects.tags.put",
        },
      },
    },
    cloudwatch: {
      logGroups: {
        list: "aws.cloudwatch.log-groups.list",
        create: "aws.cloudwatch.log-groups.create",
        delete: "aws.cloudwatch.log-groups.delete",
      },
      logStreams: {
        list: "aws.cloudwatch.log-streams.list",
        create: "aws.cloudwatch.log-streams.create",
        delete: "aws.cloudwatch.log-streams.delete",
      },
      logEvents: {
        list: "aws.cloudwatch.log-events.list",
        put: "aws.cloudwatch.log-events.put",
      },
      alarms: {
        list: "aws.cloudwatch.alarms.list",
      },
      metrics: {
        list: "aws.cloudwatch.metrics.list",
      },
    },
    eks: {
      clusters: {
        list: "aws.eks.clusters.list",
        describe: "aws.eks.clusters.describe",
      },
      nodegroups: {
        list: "aws.eks.nodegroups.list",
        describe: "aws.eks.nodegroups.describe",
        create: "aws.eks.nodegroups.create",
        delete: "aws.eks.nodegroups.delete",
      },
      fargateProfiles: {
        list: "aws.eks.fargate-profiles.list",
        describe: "aws.eks.fargate-profiles.describe",
        create: "aws.eks.fargate-profiles.create",
        delete: "aws.eks.fargate-profiles.delete",
      },
    },
    rds: {
      instances: {
        list: "aws.rds.instances.list",
        describe: "aws.rds.instances.describe",
      },
      snapshots: {
        list: "aws.rds.snapshots.list",
        create: "aws.rds.snapshots.create",
      },
    },
  },
} as const;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export const endpointRegistry: EndpointRegistry = new Map([
  // Cloud Proxy
  [
    apiEndpointKeys.clouds.list,
    {
      path: "/clouds",
      method: "GET",
      telemetry: { provider: "system", service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.services,
    {
      path: "/clouds/:cloud/services",
      method: "GET",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.status,
    {
      path: "/clouds/:cloud/status",
      method: "GET",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.schema,
    {
      path: "/clouds/:cloud/services/:service/schema",
      method: "GET",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.resources.list,
    {
      path: "/clouds/:cloud/services/:service/resources",
      method: "GET",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.resources.get,
    {
      path: "/clouds/:cloud/services/:service/resources/:id",
      method: "GET",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.resources.create,
    {
      path: "/clouds/:cloud/services/:service/resources",
      method: "POST",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.resources.delete,
    {
      path: "/clouds/:cloud/services/:service/resources/:id",
      method: "DELETE",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.storage.objects.list,
    {
      path: "/clouds/:cloud/services/storage/resources/:id/objects",
      method: "GET",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.storage.objects.upload,
    {
      path: "/clouds/:cloud/services/storage/resources/:id/object",
      method: "PUT",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.storage.objects.download,
    {
      path: "/clouds/:cloud/services/storage/resources/:id/object",
      method: "GET",
      telemetry: { service: "cloud-proxy" },
    },
  ],
  [
    apiEndpointKeys.clouds.storage.objects.delete,
    {
      path: "/clouds/:cloud/services/storage/resources/:id/object",
      method: "DELETE",
      telemetry: { service: "cloud-proxy" },
    },
  ],

  // AWS S3
  [
    apiEndpointKeys.aws.s3.buckets.list,
    {
      path: "/s3/buckets",
      method: "GET",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.buckets.create,
    {
      path: "/s3/buckets",
      method: "POST",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.buckets.delete,
    {
      path: "/s3/:bucket",
      method: "DELETE",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.objects.list,
    {
      path: "/s3/:bucket/objects",
      method: "GET",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.objects.upload,
    {
      path: "/s3/:bucket/object",
      method: "PUT",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.objects.delete,
    {
      path: "/s3/:bucket/object",
      method: "DELETE",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.objects.deleteMany,
    {
      path: "/s3/:bucket/objects/delete",
      method: "POST",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.objects.copy,
    {
      path: "/s3/copy",
      method: "POST",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.objects.metadata,
    {
      path: "/s3/:bucket/object/metadata",
      method: "GET",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.objects.tags.get,
    {
      path: "/s3/:bucket/object/tags",
      method: "GET",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.objects.tags.put,
    {
      path: "/s3/:bucket/object/tags",
      method: "PUT",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.buckets.getBucketVersioning,
    {
      path: "/s3/:bucket/versioning",
      method: "GET",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.buckets.versioning.put,
    {
      path: "/s3/:bucket/versioning",
      method: "PUT",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.buckets.getBucketTagging,
    {
      path: "/s3/:bucket/tags",
      method: "GET",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],
  [
    apiEndpointKeys.aws.s3.buckets.tags.put,
    {
      path: "/s3/:bucket/tags",
      method: "PUT",
      telemetry: { provider: "aws", service: "s3" },
    },
  ],

  // AWS CloudWatch
  [
    apiEndpointKeys.aws.cloudwatch.logGroups.list,
    {
      path: "/cloudwatch/log-groups",
      method: "GET",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.logGroups.create,
    {
      path: "/cloudwatch/log-groups",
      method: "POST",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.logGroups.delete,
    {
      path: "/cloudwatch/log-groups",
      method: "DELETE",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.logStreams.list,
    {
      path: "/cloudwatch/log-streams",
      method: "GET",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.logStreams.create,
    {
      path: "/cloudwatch/log-streams",
      method: "POST",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.logStreams.delete,
    {
      path: "/cloudwatch/log-streams",
      method: "DELETE",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.logEvents.list,
    {
      path: "/cloudwatch/log-events",
      method: "GET",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.logEvents.put,
    {
      path: "/cloudwatch/log-events",
      method: "POST",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.alarms.list,
    {
      path: "/cloudwatch/alarms",
      method: "GET",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],
  [
    apiEndpointKeys.aws.cloudwatch.metrics.list,
    {
      path: "/cloudwatch/metrics",
      method: "GET",
      telemetry: { provider: "aws", service: "cloudwatch" },
    },
  ],

  // AWS EKS
  [
    apiEndpointKeys.aws.eks.clusters.list,
    {
      path: "/eks/clusters",
      method: "GET",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.clusters.describe,
    {
      path: "/eks/clusters/:name",
      method: "GET",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.nodegroups.list,
    {
      path: "/eks/clusters/:name/nodegroups",
      method: "GET",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.nodegroups.describe,
    {
      path: "/eks/clusters/:name/nodegroups/:nodegroup",
      method: "GET",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.nodegroups.create,
    {
      path: "/eks/clusters/:name/nodegroups",
      method: "POST",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.nodegroups.delete,
    {
      path: "/eks/clusters/:name/nodegroups/:nodegroup",
      method: "DELETE",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.fargateProfiles.list,
    {
      path: "/eks/clusters/:name/fargate-profiles",
      method: "GET",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.fargateProfiles.describe,
    {
      path: "/eks/clusters/:name/fargate-profiles/:profile",
      method: "GET",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.fargateProfiles.create,
    {
      path: "/eks/clusters/:name/fargate-profiles",
      method: "POST",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],
  [
    apiEndpointKeys.aws.eks.fargateProfiles.delete,
    {
      path: "/eks/clusters/:name/fargate-profiles/:profile",
      method: "DELETE",
      telemetry: { provider: "aws", service: "eks" },
    },
  ],

  // AWS RDS
  [
    apiEndpointKeys.aws.rds.instances.list,
    {
      path: "/rds/instances",
      method: "GET",
      telemetry: { provider: "aws", service: "rds" },
    },
  ],
  [
    apiEndpointKeys.aws.rds.instances.describe,
    {
      path: "/rds/instances/:identifier",
      method: "GET",
      telemetry: { provider: "aws", service: "rds" },
    },
  ],
  [
    apiEndpointKeys.aws.rds.snapshots.list,
    {
      path: "/rds/snapshots",
      method: "GET",
      telemetry: { provider: "aws", service: "rds" },
    },
  ],
  [
    apiEndpointKeys.aws.rds.snapshots.create,
    {
      path: "/rds/snapshots",
      method: "POST",
      telemetry: { provider: "aws", service: "rds" },
    },
  ],

  // TODO: migrate remaining services into this registry.
]);

// ─── Client Factory ───────────────────────────────────────────────────────────

export function createApiClient(
  getToken?: () => string | null | Promise<string | null>,
) {
  const client = new HttpClient(
    {
      baseUrl: API_BASE_URL,
      defaultHeaders: { Accept: "application/json" },
      timeout: 10_000,
    },
    endpointRegistry,
  );

  // Auth interceptor — attaches Bearer token if available
  if (getToken) {
    client.addRequestInterceptor(async (url, init) => {
      const token = await getToken();
      if (token) {
        (init.headers as Record<string, string>)["Authorization"] =
          `Bearer ${token}`;
      }
      return { url, init };
    });
  }

  // Logging interceptor (dev only)
  if (import.meta.env.DEV) {
    client.addResponseInterceptor((res) => {
      console.debug(`[HTTP] ${res.status} ${res.url}`);
      return res;
    });
  }

  //  client.addResponseInterceptor((res) => {
  //    if (res.status === 401) {
  //      handleUnauthorizedApiResponse();
  //    }
  //    return res;
  //  });

  return client;
}

export const apiClient = createApiClient();
