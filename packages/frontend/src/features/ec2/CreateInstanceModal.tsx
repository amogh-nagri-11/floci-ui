import { useState } from "react";
import { Loader2, Plus, Server } from "lucide-react";
import { useCreateEc2InstanceMutation } from "@/api/aws/ec2.mutations";
import { authorizeEc2SecurityGroupIngress, createEc2SecurityGroup } from "@/api/aws/ec2.api";
import { SgRuleTable, allRulesValid, ruleToPermission } from "./SgRuleTable";
import type { SgRule } from "./SgRuleTable";
import {
  useEc2AmisQuery,
  useEc2InstanceTypesQuery,
  useEc2KeyPairsQuery,
  useEc2SecurityGroupsQuery,
  useEc2SubnetsQuery,
  useEc2VpcsQuery,
} from "@/api/aws/ec2.queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const INSTANCE_TYPES_FALLBACK = [
  "t2.micro", "t2.small", "t2.medium", "t2.large",
  "t3.micro", "t3.small", "t3.medium", "t3.large", "t3.xlarge",
  "m5.large", "m5.xlarge", "m5.2xlarge",
  "m6i.large", "m6i.xlarge",
  "c5.large", "c5.xlarge", "c5.2xlarge",
  "c6i.large", "c6i.xlarge",
  "r5.large", "r5.xlarge",
  "r6i.large",
];

const VOLUME_TYPES = [
  { value: "gp3", label: "gp3 — General Purpose SSD (recommended)" },
  { value: "gp2", label: "gp2 — General Purpose SSD" },
  { value: "io1", label: "io1 — Provisioned IOPS SSD" },
  { value: "st1", label: "st1 — Throughput Optimized HDD" },
  { value: "sc1", label: "sc1 — Cold HDD" },
];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateInstanceModal({ onClose, onCreated }: Props) {
  // Identity
  const [name, setName] = useState("");

  // AMI & instance type
  const [imageId, setImageId] = useState("");
  const [instanceType, setInstanceType] = useState("t3.micro");

  // Key pair
  const [keyName, setKeyName] = useState("");

  // Network
  const [selectedVpcId, setSelectedVpcId] = useState("");
  const [selectedSubnetId, setSelectedSubnetId] = useState("");
  const [selectedSgIds, setSelectedSgIds] = useState<string[]>([]);
  const [publicIp, setPublicIp] = useState<"enable" | "disable" | "subnet">("subnet");

  // Storage
  const [rootVolumeSize, setRootVolumeSize] = useState(8);
  const [rootVolumeType, setRootVolumeType] = useState("gp3");

  // Advanced
  const [userData, setUserData] = useState("");

  // Inline create SG
  const [showNewSg, setShowNewSg] = useState(false);
  const [newSgName, setNewSgName] = useState("");
  const [newSgDesc, setNewSgDesc] = useState("");
  const [newSgVpcId, setNewSgVpcId] = useState("");
  const [newSgInboundRules, setNewSgInboundRules] = useState<SgRule[]>([]);
  const [newSgErr, setNewSgErr] = useState("");

  const [err, setErr] = useState("");

  const qc = useQueryClient();
  const amisQuery = useEc2AmisQuery();
  const instanceTypesQuery = useEc2InstanceTypesQuery();
  const instanceTypeOptions = instanceTypesQuery.data?.map((t) => t.instanceType) ?? INSTANCE_TYPES_FALLBACK;
  const keyPairsQuery = useEc2KeyPairsQuery(true);
  const vpcsQuery = useEc2VpcsQuery(true);
  const subnetsQuery = useEc2SubnetsQuery(selectedVpcId || undefined, true);
  const sgsQuery = useEc2SecurityGroupsQuery(selectedVpcId || undefined, true);

  const mutation = useCreateEc2InstanceMutation();

  const createSgMut = useMutation({
    mutationFn: async () => {
      const sg = await createEc2SecurityGroup(newSgName.trim(), newSgDesc.trim() || newSgName.trim(), newSgVpcId || selectedVpcId || undefined);
      for (const r of newSgInboundRules) {
        await authorizeEc2SecurityGroupIngress(sg.groupId, ruleToPermission(r));
      }
      return sg;
    },
    onSuccess: (sg) => {
      void qc.invalidateQueries({ queryKey: ['ec2', 'security-groups'] });
      setSelectedSgIds((prev) => [...prev, sg.groupId]);
      setNewSgName(""); setNewSgDesc(""); setNewSgInboundRules([]); setNewSgErr(""); setShowNewSg(false);
    },
    onError: (e) => setNewSgErr(e instanceof Error ? e.message : "Create failed."),
  });

  function handleVpcChange(vpcId: string) {
    setSelectedVpcId(vpcId);
    setSelectedSubnetId("");
    setSelectedSgIds([]);
  }

  function toggleSg(sgId: string) {
    setSelectedSgIds((prev) =>
      prev.includes(sgId) ? prev.filter((id) => id !== sgId) : [...prev, sgId],
    );
  }

  function handleSubmit() {
    if (!name.trim()) { setErr("Name is required."); return; }
    if (!imageId.trim()) { setErr("AMI is required."); return; }
    setErr("");
    mutation.mutate(
      {
        name: name.trim(),
        imageId: imageId.trim(),
        instanceType,
        keyName: keyName || undefined,
        subnetId: selectedSubnetId || undefined,
        securityGroupIds: selectedSgIds.length ? selectedSgIds : undefined,
        associatePublicIpAddress: publicIp === "enable" ? true : publicIp === "disable" ? false : undefined,
        rootVolumeSize,
        rootVolumeType,
        userData: userData || undefined,
      },
      {
        onSuccess: () => { onCreated(); onClose(); },
        onError: (e) => setErr(e instanceof Error ? e.message : "Launch failed."),
      },
    );
  }

  const subnets = subnetsQuery.data ?? [];
  const sgs = sgsQuery.data ?? [];
  const keyPairs = keyPairsQuery.data ?? [];
  const amis = amisQuery.data ?? [];
  const vpcs = vpcsQuery.data ?? [];

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="create-table-modal" style={{ maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }}>
        <h3>Launch instance</h3>

        {/* ── Name ── */}
        <div className="modal-section">
          <p className="modal-section-title">Name</p>
          <input
            className="input" style={{ width: "100%", minWidth: "unset" }}
            autoFocus placeholder="my-instance"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />
        </div>

        {/* ── AMI ── */}
        <div className="modal-section">
          <p className="modal-section-title">Amazon Machine Image (AMI)</p>
          <select className="input" style={{ width: "100%" }} value={imageId} onChange={(e) => setImageId(e.target.value)}>
            <option value="">— select AMI —</option>
            {amis.map((ami) => (
              <option key={ami.imageId} value={ami.imageId}>
                {ami.name} ({ami.imageId})
              </option>
            ))}
          </select>
          {!amis.length && (
            <input
              className="input" style={{ width: "100%", minWidth: "unset", marginTop: 6 }}
              placeholder="ami-xxxxxxxxxxxxxxxxx"
              value={imageId} onChange={(e) => setImageId(e.target.value)}
            />
          )}
        </div>

        {/* ── Instance type ── */}
        <div className="modal-section">
          <p className="modal-section-title">Instance type</p>
          <select className="input" style={{ width: "100%" }} value={instanceType} onChange={(e) => setInstanceType(e.target.value)}>
            {instanceTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* ── Key pair ── */}
        <div className="modal-section">
          <p className="modal-section-title">Key pair (login)</p>
          <select className="input" style={{ width: "100%" }} value={keyName} onChange={(e) => setKeyName(e.target.value)}>
            <option value="">— Proceed without key pair —</option>
            {keyPairs.map((kp) => (
              <option key={kp.keyName} value={kp.keyName}>{kp.keyName}</option>
            ))}
          </select>
          {!keyPairs.length && (
            <p style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
              No key pairs found. Create one in the Key Pairs section first.
            </p>
          )}
        </div>

        {/* ── Network settings ── */}
        <div className="modal-section">
          <p className="modal-section-title">Network settings</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* VPC */}
            <div>
              <p style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>VPC</p>
              <select className="input" style={{ width: "100%", boxSizing: "border-box" }} value={selectedVpcId} onChange={(e) => handleVpcChange(e.target.value)}>
                <option value="">— default VPC —</option>
                {vpcs.map((vpc) => (
                  <option key={vpc.vpcId} value={vpc.vpcId}>
                    {vpc.vpcId} ({vpc.cidrBlock}){vpc.isDefault ? " — default" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Subnet */}
            <div>
              <p style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>Subnet</p>
              <select className="input" style={{ width: "100%", boxSizing: "border-box" }} value={selectedSubnetId} onChange={(e) => setSelectedSubnetId(e.target.value)}>
                <option value="">— No preference (default subnet) —</option>
                {subnets.map((s) => (
                  <option key={s.subnetId} value={s.subnetId}>
                    {s.subnetId} · {s.cidrBlock} · {s.availabilityZone}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-assign public IP + Security groups side by side */}
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: "0 0 180px" }}>
                <p style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>Auto-assign public IP</p>
                <select className="input" style={{ width: "100%", boxSizing: "border-box" }} value={publicIp} onChange={(e) => setPublicIp(e.target.value as "enable" | "disable" | "subnet")}>
                  <option value="subnet">Subnet default</option>
                  <option value="enable">Enable</option>
                  <option value="disable">Disable</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                  <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0 }}>
                    Security groups{selectedSgIds.length > 0 ? ` (${selectedSgIds.length})` : ""}
                  </p>
                  <button type="button" className="icon-btn" style={{ marginLeft: "auto" }}
                    title="Create new security group" onClick={() => { setShowNewSg(true); setNewSgVpcId(selectedVpcId); }}>
                    <Plus size={12} />
                  </button>
                </div>
                {sgs.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 96, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 8px" }}>
                    {sgs.map((sg) => (
                      <label key={sg.groupId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", minWidth: 0 }}>
                        <input type="checkbox" checked={selectedSgIds.includes(sg.groupId)} onChange={() => toggleSg(sg.groupId)} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <strong>{sg.groupName}</strong>
                          <span style={{ color: "var(--text-2)", fontSize: 11, marginLeft: 4 }}>{sg.groupId}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--text-2)" }}>No SGs. Click <strong>+</strong> to create one.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Configure storage ── */}
        <div className="modal-section">
          <p className="modal-section-title">Configure storage</p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 96px" }}>
              <p style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>Size (GiB)</p>
              <input
                className="input" type="number" min={1} max={16384}
                style={{ width: "100%", minWidth: "unset", boxSizing: "border-box" }}
                value={rootVolumeSize}
                onChange={(e) => setRootVolumeSize(Math.max(1, parseInt(e.target.value) || 8))}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>Volume type</p>
              <select className="input" style={{ width: "100%", boxSizing: "border-box" }} value={rootVolumeType} onChange={(e) => setRootVolumeType(e.target.value)}>
                {VOLUME_TYPES.map((vt) => <option key={vt.value} value={vt.value}>{vt.label}</option>)}
              </select>
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0 }}>Root volume · deleted on termination</p>
        </div>

        {/* ── Advanced details ── */}
        <div className="modal-section">
          <p className="modal-section-title">User data</p>
          <textarea
            className="input"
            style={{ width: "100%", minWidth: "unset", boxSizing: "border-box", fontFamily: "monospace", fontSize: 11, resize: "vertical", minHeight: 72 }}
            placeholder={"#!/bin/bash\necho hello"}
            value={userData} onChange={(e) => setUserData(e.target.value)}
          />
        </div>

        {err && <p style={{ fontSize: 12, color: "#f87171", margin: "0 0 8px" }}>{err}</p>}

        <div className="modal-footer">
          <button className="button" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
          <button
            className="button primary" onClick={handleSubmit}
            disabled={!name.trim() || !imageId.trim() || mutation.isPending}
          >
            {mutation.isPending ? <Loader2 size={13} /> : <Server size={13} />}
            Launch instance
          </button>
        </div>
      </div>

      {/* ── Create SG sub-modal ── */}
      {showNewSg && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowNewSg(false); setNewSgErr(""); } }}>
          <div className="create-table-modal" style={{ width: 900, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>Create security group</h3>

            <div className="modal-section">
              <p className="modal-section-title">Name</p>
              <input className="input" style={{ width: "100%", minWidth: "unset" }} autoFocus
                placeholder="my-sg" value={newSgName}
                onChange={(e) => setNewSgName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setShowNewSg(false), setNewSgErr(""))} />
            </div>
            <div className="modal-section">
              <p className="modal-section-title">Description</p>
              <input className="input" style={{ width: "100%", minWidth: "unset" }}
                placeholder="Description" value={newSgDesc}
                onChange={(e) => setNewSgDesc(e.target.value)} />
            </div>
            <div className="modal-section">
              <p className="modal-section-title">VPC</p>
              <select className="input" style={{ width: "100%" }}
                value={newSgVpcId} onChange={(e) => setNewSgVpcId(e.target.value)}>
                <option value="">— default VPC —</option>
                {vpcs.map((vpc) => (
                  <option key={vpc.vpcId} value={vpc.vpcId}>
                    {vpc.vpcId} ({vpc.cidrBlock}){vpc.isDefault ? " — default" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Inbound rules */}
            <div className="modal-section">
              <p className="modal-section-title">Inbound rules</p>
              <SgRuleTable rules={newSgInboundRules} onChange={setNewSgInboundRules} direction="Inbound" />
            </div>

            {/* Outbound rules */}
            <div className="modal-section">
              <p className="modal-section-title">Outbound rules</p>
              <SgRuleTable
                rules={[{ id: "default", type: "all", protocol: "-1", fromPort: "0", toPort: "0", cidr: "0.0.0.0/0", description: "Default — all traffic out" }]}
                onChange={() => {}}
                direction="Outbound"
                addLabel="disabled"
              />
              <p style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
                Outbound rules can be edited after creation.
              </p>
            </div>

            {newSgErr && <p style={{ fontSize: 12, color: "#f87171", margin: "0 0 8px" }}>{newSgErr}</p>}
            <div className="modal-footer">
              <button className="button" onClick={() => { setShowNewSg(false); setNewSgErr(""); }}
                disabled={createSgMut.isPending}>Cancel</button>
              <button className="button primary"
                disabled={!newSgName.trim() || !newSgDesc.trim() || !allRulesValid(newSgInboundRules) || createSgMut.isPending}
                onClick={() => createSgMut.mutate()}>
                {createSgMut.isPending ? <Loader2 size={13} /> : <Plus size={13} />}
                Create &amp; select
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
