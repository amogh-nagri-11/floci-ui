import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rdsClient } from "./rds.api";
import { rdsQueryKeys } from "./rds.queries";

export type CreateRdsSnapshotInput = {
  instanceIdentifier: string;
  snapshotIdentifier?: string;
};

export function useCreateRdsSnapshotMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ instanceIdentifier, snapshotIdentifier }: CreateRdsSnapshotInput) =>
      rdsClient.createSnapshot(instanceIdentifier, snapshotIdentifier),
    onSuccess: (_, input) => {
      void qc.invalidateQueries({
        queryKey: rdsQueryKeys.snapshots(input.instanceIdentifier),
      });
      void qc.invalidateQueries({
        queryKey: rdsQueryKeys.snapshots(),
      });
    },
  });
}
