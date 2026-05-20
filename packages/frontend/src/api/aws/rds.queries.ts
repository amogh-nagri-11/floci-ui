import { useQuery } from "@tanstack/react-query";
import { rdsClient } from "./rds.api";

export const rdsQueryKeys = {
  instances: ["rds", "instances"] as const,
  instance: (identifier: string | null) =>
    ["rds", "instance", identifier] as const,
  snapshots: (instanceIdentifier?: string | null) =>
    ["rds", "snapshots", instanceIdentifier ?? "all"] as const,
};

export function useRdsInstancesQuery() {
  return useQuery({
    queryKey: rdsQueryKeys.instances,
    queryFn: ({ signal }) => rdsClient.listInstances(signal),
    refetchInterval: 30_000,
  });
}

export function useRdsInstanceQuery(identifier: string | null) {
  return useQuery({
    queryKey: rdsQueryKeys.instance(identifier),
    queryFn: ({ signal }) => rdsClient.describeInstance(identifier!, signal),
    enabled: Boolean(identifier),
    refetchInterval: 30_000,
  });
}

export function useRdsSnapshotsQuery(instanceIdentifier?: string | null) {
  return useQuery({
    queryKey: rdsQueryKeys.snapshots(instanceIdentifier),
    queryFn: ({ signal }) =>
      rdsClient.listSnapshots(instanceIdentifier ?? undefined, signal),
    enabled: instanceIdentifier !== null,
    refetchInterval: 30_000,
  });
}
