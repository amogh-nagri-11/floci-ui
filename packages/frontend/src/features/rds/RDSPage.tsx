import { useEffect, useMemo, useState } from "react";
import { Database, HardDrive, Info, Network, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import type { RdsInstance } from "@/api/aws/rds.api";
import {
  useRdsInstanceQuery,
  useRdsInstancesQuery,
} from "@/api/aws/rds.queries";

function statusClass(status?: string) {
  const normalized = status?.toLowerCase();
  if (normalized === "available") return "healthy";
  if (
    normalized === "creating" ||
    normalized === "modifying" ||
    normalized === "backing-up"
  ) {
    return "degraded";
  }
  if (normalized === "failed" || normalized === "deleting") return "unavailable";
  return "unknown";
}

function yesNo(value?: boolean) {
  if (value === undefined) return "-";
  return value ? "Enabled" : "Disabled";
}

function InstanceListItem({
  instance,
  active,
  onSelect,
}: {
  instance: RdsInstance;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`list-item ${active ? "active" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <strong>{instance.identifier}</strong>
      <span>
        {instance.engine ?? "database"} {instance.engineVersion ?? "-"} ·{" "}
        {instance.instanceClass ?? "-"}
      </span>
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  );
}

function InstanceSummary({ instance }: { instance: RdsInstance }) {
  const endpoint = instance.endpoint;

  return (
    <div className="grid two">
      <div className="widget">
        <div className="widget-header">
          <Database size={13} color="var(--accent)" />
          <h3>Instance</h3>
        </div>
        <div className="widget-body">
          <div className="meta-grid">
            <Meta label="Status" value={instance.status ?? "unknown"} />
            <Meta label="DB name" value={instance.dbName ?? "-"} />
            <Meta label="Engine" value={instance.engine ?? "-"} />
            <Meta label="Engine version" value={instance.engineVersion ?? "-"} />
            <Meta label="Class" value={instance.instanceClass ?? "-"} />
            <Meta label="Master user" value={instance.masterUsername ?? "-"} />
            <Meta label="ARN" value={instance.arn ?? "-"} />
          </div>
        </div>
      </div>

      <div className="widget">
        <div className="widget-header">
          <HardDrive size={13} color="var(--accent)" />
          <h3>Storage</h3>
        </div>
        <div className="widget-body">
          <div className="meta-grid">
            <Meta
              label="Allocated"
              value={
                instance.allocatedStorage !== undefined
                  ? `${instance.allocatedStorage} GB`
                  : "-"
              }
            />
            <Meta label="Storage type" value={instance.storageType ?? "-"} />
            <Meta label="Availability zone" value={instance.availabilityZone ?? "-"} />
            <Meta label="Multi AZ" value={yesNo(instance.multiAz)} />
            <Meta label="Public access" value={yesNo(instance.publiclyAccessible)} />
            <Meta
              label="IAM auth"
              value={yesNo(instance.iamDatabaseAuthenticationEnabled)}
            />
            <Meta
              label="Endpoint"
              value={
                endpoint?.address
                  ? `${endpoint.address}:${endpoint.port ?? ""}`
                  : "-"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function NetworkTable({ instance }: { instance: RdsInstance }) {
  const subnets = instance.subnetGroup?.subnets ?? [];

  return (
    <div className="grid two section-space">
      <div className="table-panel">
        <div className="widget-header">
          <Network size={13} color="var(--text-2)" />
          <h3>Security groups</h3>
        </div>
        {instance.vpcSecurityGroups.length === 0 ? (
          <div className="empty compact"><p>No security groups.</p></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {instance.vpcSecurityGroups.map((group) => (
                <tr key={group.id ?? group.status}>
                  <td className="mono">{group.id ?? "-"}</td>
                  <td>{group.status ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-panel">
        <div className="widget-header">
          <Network size={13} color="var(--text-2)" />
          <h3>Subnets</h3>
        </div>
        {subnets.length === 0 ? (
          <div className="empty compact"><p>No subnet group.</p></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Subnet</th>
                <th>AZ</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subnets.map((subnet) => (
                <tr key={subnet.identifier ?? subnet.availabilityZone}>
                  <td className="mono">{subnet.identifier ?? "-"}</td>
                  <td>{subnet.availabilityZone ?? "-"}</td>
                  <td>{subnet.status ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function RDSPage() {
  const instancesQuery = useRdsInstancesQuery();
  const instances = useMemo(() => instancesQuery.data ?? [], [instancesQuery.data]);
  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedIdentifier && instances[0]) {
      setSelectedIdentifier(instances[0].identifier);
    }
  }, [instances, selectedIdentifier]);

  const selectedFromList = useMemo(
    () =>
      instances.find((instance) => instance.identifier === selectedIdentifier) ??
      null,
    [instances, selectedIdentifier],
  );
  const instanceQuery = useRdsInstanceQuery(selectedIdentifier);
  const selectedInstance = instanceQuery.data ?? selectedFromList;

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h2>RDS</h2>
          <span className="info-link">
            <Info size={11} />
            Database instances
          </span>
        </div>
        <button
          className="button"
          onClick={() => {
            void instancesQuery.refetch();
            void instanceQuery.refetch();
          }}
          type="button"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      <div className="split">
        <aside className="list-pane">
          <div className="widget-header">
            <Database size={13} color="var(--text-2)" />
            <h3>Instances ({instances.length})</h3>
          </div>

          {instancesQuery.isLoading ? (
            <div className="empty compact"><p>Loading instances...</p></div>
          ) : instancesQuery.isError ? (
            <EmptyState
              icon={Database}
              title="Cannot load instances"
              description="RDS did not respond from the Floci endpoint."
            />
          ) : instances.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No RDS instances"
              description="No database instances were returned by Floci."
            />
          ) : (
            instances.map((instance) => (
              <InstanceListItem
                key={instance.arn ?? instance.identifier}
                instance={instance}
                active={selectedIdentifier === instance.identifier}
                onSelect={() => setSelectedIdentifier(instance.identifier)}
              />
            ))
          )}
        </aside>

        <section className="detail-pane">
          {!selectedInstance ? (
            <EmptyState
              icon={Database}
              title="Select an instance"
              description="Choose an RDS instance to inspect connection, storage, and networking."
            />
          ) : (
            <div className="content">
              <div className="page-title" style={{ marginBottom: 16 }}>
                <Database size={18} color="var(--accent)" />
                <h2>{selectedInstance.identifier}</h2>
                <span className={`status ${statusClass(selectedInstance.status)}`}>
                  {selectedInstance.status ?? "unknown"}
                </span>
              </div>

              {instanceQuery.isError ? (
                <EmptyState
                  icon={Database}
                  title="Cannot load instance details"
                  description="RDS did not return details for this instance."
                />
              ) : (
                <>
                  <InstanceSummary instance={selectedInstance} />
                  <NetworkTable instance={selectedInstance} />
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
