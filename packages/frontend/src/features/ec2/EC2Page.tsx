import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  Copy,
  Globe,
  HardDrive,
  Info,
  Key,
  Layers,
  Loader2,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  Terminal,
  Trash2,
  Wand2,

  Router,
} from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SgRuleTable, allRulesValid, ruleToPermission } from './SgRuleTable'
import type { SgRule } from './SgRuleTable'
import { isCidrWithinBlock, isValidCidr, isValidKeyPairName } from './validators'
import {
  authorizeEc2SecurityGroupIngress,
  createEc2KeyPair,
  createEc2SecurityGroup,
  createEc2Subnet,
  createEc2Vpc,
  deleteEc2KeyPair,
  deleteEc2SecurityGroup,
  deleteEc2Subnet,
  deleteEc2Vpc,
  deregisterEc2Ami,
  authorizeEc2SecurityGroupEgress,
  revokeEc2SecurityGroupEgress,
  revokeEc2SecurityGroupIngress,
  startEc2Instance,
  stopEc2Instance,
  rebootEc2Instance,
  terminateEc2Instance,
} from '@/api/aws/ec2.api'
import type {
  Ec2IpPermission,
  Ec2KeyPair,
  Ec2KeyPairMaterial,
  IpPermissionInput,
} from '@/api/aws/ec2.api'
import {
  ec2QueryKeys,
  useEc2AmisQuery,
  useEc2AvailabilityZonesQuery,
  useEc2ConsoleOutputQuery,
  useEc2ElasticIpsQuery,
  useEc2InstanceQuery,
  useEc2InstancesQuery,
  useEc2InternetGatewaysQuery,
  useEc2KeyPairsQuery,
  useEc2RouteTablesQuery,
  useEc2SecurityGroupsQuery,
  useEc2SubnetsQuery,
  useEc2VpcAttributesQuery,
  useEc2VpcsQuery,
} from '@/api/aws/ec2.queries'
import {
  useAssociateElasticIpMutation,
  useAttachInternetGatewayMutation,
  useDeleteInternetGatewayMutation,
  useDeleteRouteTableMutation,
  useDisassociateElasticIpMutation,
  useModifySubnetAttributeMutation,
  useModifyVpcAttributeMutation,
  useReleaseElasticIpMutation,
} from '@/api/aws/ec2.mutations'
import { CreateInstanceModal } from './CreateInstanceModal'
import { CreateAmiModal } from './CreateAmiModal'
import { TagEditor } from './TagEditor'
import { VpcWizardModal } from './VpcWizardModal'
import { CreateIgwModal } from './CreateIgwModal'
import { CreateRtbModal } from './CreateRtbModal'
import { AllocateEipModal } from './AllocateEipModal'
import { RouteTableEditor } from './RouteTableEditor'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stateClass(state?: string) {
  const s = state?.toLowerCase()
  if (s === 'running') return 'healthy'
  if (s === 'pending' || s === 'stopping' || s === 'rebooting') return 'degraded'
  if (s === 'stopped' || s === 'terminated' || s === 'shutting-down') return 'unavailable'
  return 'unknown'
}

function canStart(state?: string) { return state === 'stopped' }
function canStop(state?: string) { return state === 'running' }
function canReboot(state?: string) { return state === 'running' }
function canTerminate(state?: string) { return state !== 'terminated' && state !== 'shutting-down' }

function portDisplay(p: number | null) { return p === null || p === -1 ? '-' : String(p) }
function protocolLabel(p: string) { return p === '-1' ? 'All traffic' : p.toUpperCase() }

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  )
}

// ─── Selection type ───────────────────────────────────────────────────────────

type Selection =
  | { kind: 'instance'; id: string }
  | { kind: 'ami'; id: string }
  | { kind: 'sg'; id: string }
  | { kind: 'kp'; name: string }
  | { kind: 'vpc'; id: string }
  | { kind: 'subnet'; id: string }
  | { kind: 'igw'; id: string }
  | { kind: 'rtb'; id: string }
  | { kind: 'eip'; id: string }

// ─── Create SG modal ──────────────────────────────────────────────────────────

function CreateSgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [vpcId, setVpcId] = useState('')
  const [inboundRules, setInboundRules] = useState<SgRule[]>([])
  const [err, setErr] = useState('')
  const vpcsQuery = useEc2VpcsQuery(true)

  const mutation = useMutation({
    mutationFn: async () => {
      const sg = await createEc2SecurityGroup(name.trim(), description.trim(), vpcId || undefined)
      for (const r of inboundRules) {
        await authorizeEc2SecurityGroupIngress(sg.groupId, ruleToPermission(r))
      }
      return sg
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ec2', 'security-groups'] })
      onCreated()
      onClose()
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Create failed.'),
  })

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="create-table-modal" style={{ width: 900, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <h3>Create security group</h3>

        <div className="modal-section">
          <p className="modal-section-title">Name</p>
          <input className="input" style={{ width: '100%', minWidth: 'unset' }} autoFocus value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} />
        </div>
        <div className="modal-section">
          <p className="modal-section-title">Description</p>
          <input className="input" style={{ width: '100%', minWidth: 'unset' }} value={description}
            onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="modal-section">
          <p className="modal-section-title">VPC</p>
          <select className="input" style={{ width: '100%' }} value={vpcId} onChange={(e) => setVpcId(e.target.value)}>
            <option value="">— default VPC —</option>
            {(vpcsQuery.data ?? []).map((v) => (
              <option key={v.vpcId} value={v.vpcId}>{v.vpcId} ({v.cidrBlock}){v.isDefault ? ' — default' : ''}</option>
            ))}
          </select>
        </div>

        <div className="modal-section">
          <p className="modal-section-title">Inbound rules</p>
          <SgRuleTable rules={inboundRules} onChange={setInboundRules} direction="Inbound" />
        </div>

        <div className="modal-section">
          <p className="modal-section-title">Outbound rules</p>
          <SgRuleTable rules={[{ id: 'default', type: 'all', protocol: '-1', fromPort: '0', toPort: '0', cidr: '0.0.0.0/0', description: 'Default — all traffic out' }]}
            onChange={() => {}} direction="Outbound" addLabel="disabled" />
          <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>
            Outbound rules can be edited after creation.
          </p>
        </div>

        {err && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>{err}</p>}
        <div className="modal-footer">
          <button className="button" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
          <button className="button primary" onClick={() => mutation.mutate()}
            disabled={!name.trim() || !description.trim() || !allRulesValid(inboundRules) || mutation.isPending}>
            {mutation.isPending ? <Loader2 size={13} /> : <Network size={13} />}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create KP modal + PEM display ───────────────────────────────────────────

function PemDisplay({ material, onDismiss }: { material: Ec2KeyPairMaterial; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    void navigator.clipboard.writeText(material.keyMaterial).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDismiss() }}>
      <div className="create-table-modal" style={{ maxWidth: 560 }}>
        <h3>Key pair created — {material.keyName}</h3>
        <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 12px', lineHeight: 1.5 }}>
          ⚠️ This is the only time the private key is shown. Copy it now and store it securely.
        </p>
        <pre className="mono" style={{
          background: 'var(--surface-2)', padding: 12, borderRadius: 4, fontSize: 10,
          overflowX: 'auto', whiteSpace: 'pre', margin: '0 0 12px', maxHeight: 280, overflowY: 'auto',
        }}>
          {material.keyMaterial}
        </pre>
        <div className="modal-footer">
          <button className="button primary" onClick={handleCopy}>
            <Copy size={13} />
            {copied ? 'Copied!' : 'Copy PEM'}
          </button>
          <button className="button" onClick={onDismiss}>Close</button>
        </div>
      </div>
    </div>
  )
}

function CreateKpModal({ onClose, onCreated }: { onClose: () => void; onCreated: (m: Ec2KeyPairMaterial) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  const nameErr = name.trim() && !isValidKeyPairName(name)
    ? 'Name must be 1–255 characters: letters, numbers, hyphens, underscores, or dots.'
    : null

  const mutation = useMutation({
    mutationFn: () => createEc2KeyPair(name.trim()),
    onSuccess: (material) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.keyPairs })
      onCreated(material)
      onClose()
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Create failed.'),
  })

  function handleCreate() {
    if (nameErr) { setErr(nameErr); return }
    mutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="create-table-modal" style={{ maxWidth: 380 }}>
        <h3>Create key pair</h3>
        <div className="modal-section">
          <p className="modal-section-title">Key pair name</p>
          <input
            className="input"
            style={{ width: '100%', minWidth: 'unset', borderColor: nameErr ? '#f87171' : undefined }}
            autoFocus value={name}
            onChange={(e) => { setName(e.target.value); setErr('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose() }}
          />
          {nameErr && <p style={{ fontSize: 11, color: '#f87171', margin: '4px 0 0' }}>{nameErr}</p>}
        </div>
        {err && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>{err}</p>}
        <div className="modal-footer">
          <button className="button" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
          <button className="button primary" onClick={handleCreate}
            disabled={!name.trim() || !!nameErr || mutation.isPending}>
            {mutation.isPending ? <Loader2 size={13} /> : <Key size={13} />}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create VPC modal ─────────────────────────────────────────────────────────

function CreateVpcModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient()
  const [cidr, setCidr] = useState('10.0.0.0/16')
  const [err, setErr] = useState('')

  const cidrErr = cidr.trim() && !isValidCidr(cidr.trim())
    ? 'Enter a valid CIDR block (e.g. 10.0.0.0/16).'
    : null

  const mutation = useMutation({
    mutationFn: () => createEc2Vpc(cidr.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.vpcs })
      onCreated()
      onClose()
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Create failed.'),
  })

  function handleCreate() {
    if (cidrErr) { setErr(cidrErr); return }
    mutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="create-table-modal" style={{ maxWidth: 380 }}>
        <h3>Create VPC</h3>
        <div className="modal-section">
          <p className="modal-section-title">IPv4 CIDR block</p>
          <input
            className="input"
            style={{ width: '100%', minWidth: 'unset', borderColor: cidrErr ? '#f87171' : undefined }}
            autoFocus value={cidr}
            onChange={(e) => { setCidr(e.target.value); setErr('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose() }}
          />
          {cidrErr && <p style={{ fontSize: 11, color: '#f87171', margin: '4px 0 0' }}>{cidrErr}</p>}
        </div>
        {err && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>{err}</p>}
        <div className="modal-footer">
          <button className="button" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
          <button className="button primary" onClick={handleCreate}
            disabled={!cidr.trim() || !!cidrErr || mutation.isPending}>
            {mutation.isPending ? <Loader2 size={13} /> : <Globe size={13} />}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Subnet modal ──────────────────────────────────────────────────────

function CreateSubnetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient()
  const [vpcId, setVpcId] = useState('')
  const [cidr, setCidr] = useState('10.0.1.0/24')
  const [az, setAz] = useState('')
  const [err, setErr] = useState('')
  const vpcsQuery = useEc2VpcsQuery(true)
  const vpcs = vpcsQuery.data ?? []
  const azsQuery = useEc2AvailabilityZonesQuery()
  const azs = azsQuery.data ?? []

  const selectedVpc = vpcs.find((v) => v.vpcId === vpcId) ?? null

  const cidrErr: string | null = (() => {
    if (!cidr.trim()) return null
    if (!isValidCidr(cidr.trim())) return 'Enter a valid CIDR block (e.g. 10.0.2.0/24).'
    if (selectedVpc && !isCidrWithinBlock(cidr.trim(), selectedVpc.cidrBlock))
      return `${cidr.trim()} is not within the VPC range ${selectedVpc.cidrBlock}.`
    return null
  })()

  const mutation = useMutation({
    mutationFn: () => createEc2Subnet(vpcId, cidr.trim(), az || undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ec2', 'subnets'] })
      onCreated()
      onClose()
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Create failed.'),
  })

  function handleCreate() {
    if (!vpcId) { setErr('Select a VPC.'); return }
    if (cidrErr) { setErr(cidrErr); return }
    mutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="create-table-modal" style={{ maxWidth: 420 }}>
        <h3>Create subnet</h3>
        <div className="modal-section">
          <p className="modal-section-title">VPC</p>
          <select className="input" style={{ width: '100%' }} value={vpcId}
            onChange={(e) => { setVpcId(e.target.value); setErr('') }}>
            <option value="">— select VPC —</option>
            {vpcs.map((v) => (
              <option key={v.vpcId} value={v.vpcId}>{v.vpcId} ({v.cidrBlock})</option>
            ))}
          </select>
        </div>
        <div className="modal-section">
          <p className="modal-section-title">IPv4 CIDR block</p>
          <input
            className="input"
            style={{ width: '100%', minWidth: 'unset', borderColor: cidrErr ? '#f87171' : undefined }}
            autoFocus value={cidr}
            onChange={(e) => { setCidr(e.target.value); setErr('') }}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
          {cidrErr && <p style={{ fontSize: 11, color: '#f87171', margin: '4px 0 0' }}>{cidrErr}</p>}
          {selectedVpc && !cidrErr && isValidCidr(cidr.trim()) && (
            <p style={{ fontSize: 11, color: '#4ade80', margin: '4px 0 0' }}>
              ✓ Within VPC range {selectedVpc.cidrBlock}
            </p>
          )}
        </div>
        <div className="modal-section">
          <p className="modal-section-title">Availability zone — optional</p>
          <select className="input" style={{ width: '100%' }} value={az} onChange={(e) => setAz(e.target.value)}>
            <option value="">— No preference —</option>
            {azs.map((z) => (
              <option key={z.zoneName} value={z.zoneName}>{z.zoneName}</option>
            ))}
          </select>
        </div>
        {err && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>{err}</p>}
        <div className="modal-footer">
          <button className="button" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
          <button className="button primary" onClick={handleCreate}
            disabled={!vpcId || !cidr.trim() || !!cidrErr || mutation.isPending}>
            {mutation.isPending ? <Loader2 size={13} /> : <Layers size={13} />}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ingress rule row ─────────────────────────────────────────────────────────

function IngressRuleRow({ rule, groupId, onRevoked }: { rule: Ec2IpPermission; groupId: string; onRevoked: () => void }) {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)

  const mutation = useMutation({
    mutationFn: () => {
      const cidr = rule.ipRanges[0] ?? rule.ipv6Ranges[0] ?? '0.0.0.0/0'
      return revokeEc2SecurityGroupIngress(groupId, {
        protocol: rule.protocol, fromPort: rule.fromPort ?? 0, toPort: rule.toPort ?? 0, cidr,
      } as IpPermissionInput)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ec2', 'security-groups'] })
      onRevoked()
    },
  })

  return (
    <tr>
      <td>{protocolLabel(rule.protocol)}</td>
      <td>{portDisplay(rule.fromPort)}</td>
      <td>{portDisplay(rule.toPort)}</td>
      <td>{[...rule.ipRanges, ...rule.ipv6Ranges].join(', ') || '-'}</td>
      <td>
        {confirm ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="button compact danger" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 size={12} /> : <Trash2 size={12} />}
              Revoke
            </button>
            <button className="button compact" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        ) : (
          <button className="icon-btn danger" onClick={() => setConfirm(true)} title="Revoke rule">
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Egress rule row ──────────────────────────────────────────────────────────

function EgressRuleRow({ rule, groupId, onRevoked }: { rule: Ec2IpPermission; groupId: string; onRevoked: () => void }) {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)

  const mutation = useMutation({
    mutationFn: () => {
      const cidr = rule.ipRanges[0] ?? rule.ipv6Ranges[0] ?? '0.0.0.0/0'
      return revokeEc2SecurityGroupEgress(groupId, {
        protocol: rule.protocol, fromPort: rule.fromPort ?? 0, toPort: rule.toPort ?? 0, cidr,
      } as IpPermissionInput)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ec2', 'security-groups'] })
      onRevoked()
    },
  })

  return (
    <tr>
      <td>{protocolLabel(rule.protocol)}</td>
      <td>{portDisplay(rule.fromPort)}</td>
      <td>{portDisplay(rule.toPort)}</td>
      <td>{[...rule.ipRanges, ...rule.ipv6Ranges].join(', ') || '-'}</td>
      <td>
        {confirm ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="button compact danger" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 size={12} /> : <Trash2 size={12} />}
              Revoke
            </button>
            <button className="button compact" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        ) : (
          <button className="icon-btn danger" onClick={() => setConfirm(true)} title="Revoke rule">
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Edit SG rules modal ──────────────────────────────────────────────────────

function EditSgRulesModal({
  groupId,
  direction,
  rules,
  onDone,
}: {
  groupId: string
  direction: 'ingress' | 'egress'
  rules: Ec2IpPermission[]
  onDone: () => void
}) {
  const isIngress = direction === 'ingress'
  const qc = useQueryClient()
  const [protocol, setProtocol] = useState('tcp')
  const [fromPort, setFromPort] = useState('0')
  const [toPort, setToPort] = useState('0')
  const [cidr, setCidr] = useState('0.0.0.0/0')
  const [error, setError] = useState('')

  const addMut = useMutation({
    mutationFn: (p: IpPermissionInput) =>
      isIngress
        ? authorizeEc2SecurityGroupIngress(groupId, p)
        : authorizeEc2SecurityGroupEgress(groupId, p),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ec2', 'security-groups'] }); setError('') },
    onError: (e) => setError(e instanceof Error ? e.message : 'Failed.'),
  })

  function handleAdd() {
    const fp = protocol === '-1' ? -1 : parseInt(fromPort, 10)
    const tp = protocol === '-1' ? -1 : parseInt(toPort, 10)
    if (!cidr.trim()) { setError('CIDR required.'); return }
    if (protocol !== '-1' && (isNaN(fp) || isNaN(tp))) { setError('Ports must be numbers.'); return }
    const duplicate = rules.some(
      (r) => r.protocol === protocol && r.fromPort === fp && r.toPort === tp &&
        (r.ipRanges.includes(cidr.trim()) || r.ipv6Ranges.includes(cidr.trim()))
    )
    if (duplicate) { setError('Rule already exists.'); return }
    addMut.mutate({ protocol, fromPort: fp, toPort: tp, cidr: cidr.trim() })
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDone() }}>
      <div className="create-table-modal" style={{ width: 680, maxWidth: '96vw' }}>
        <h3>Edit {isIngress ? 'inbound' : 'outbound'} rules — {groupId}</h3>

        <div className="modal-section" style={{ padding: 0, overflow: 'hidden' }}>
          {rules.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Protocol</th><th>From</th><th>To</th>
                  <th>{isIngress ? 'Source' : 'Destination'}</th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) =>
                  isIngress
                    ? <IngressRuleRow key={i} rule={rule} groupId={groupId} onRevoked={() => {}} />
                    : <EgressRuleRow key={i} rule={rule} groupId={groupId} onRevoked={() => {}} />
                )}
              </tbody>
            </table>
          ) : (
            <div className="empty compact">
              <p>No {isIngress ? 'inbound' : 'outbound'} rules.</p>
            </div>
          )}
        </div>

        <div className="modal-section">
          <p className="modal-section-title">Add rule</p>
          <div className="field-row" style={{ gap: 4, flexWrap: 'wrap' }}>
            <select className="input" style={{ flex: '0 0 110px' }} value={protocol}
              onChange={(e) => { setProtocol(e.target.value); setError('') }}>
              {['tcp', 'udp', 'icmp', '-1'].map((p) => (
                <option key={p} value={p}>{protocolLabel(p)}</option>
              ))}
            </select>
            <input className="input" style={{ flex: '0 0 64px', minWidth: 'unset' }} placeholder="From"
              value={fromPort} onChange={(e) => setFromPort(e.target.value)} disabled={protocol === '-1'} />
            <input className="input" style={{ flex: '0 0 64px', minWidth: 'unset' }} placeholder="To"
              value={toPort} onChange={(e) => setToPort(e.target.value)} disabled={protocol === '-1'} />
            <input className="input" style={{ flex: 1, minWidth: 110 }} placeholder="0.0.0.0/0"
              value={cidr} onChange={(e) => { setCidr(e.target.value); setError('') }} />
            <button className="button primary" disabled={addMut.isPending} onClick={handleAdd}>
              {addMut.isPending ? <Loader2 size={13} /> : <Plus size={13} />}
              Add
            </button>
          </div>
          {error && <p style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="button primary" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function EC2Page() {
  const qc = useQueryClient()

  const instancesQuery = useEc2InstancesQuery()
  const instances = useMemo(() => instancesQuery.data ?? [], [instancesQuery.data])

  const amisQuery = useEc2AmisQuery()
  const amis = useMemo(() => amisQuery.data ?? [], [amisQuery.data])

  const sgsQuery = useEc2SecurityGroupsQuery()
  const sgs = sgsQuery.data ?? []

  const kpsQuery = useEc2KeyPairsQuery()
  const kps = kpsQuery.data ?? []

  const vpcsQuery = useEc2VpcsQuery()
  const vpcs = vpcsQuery.data ?? []

  const subnetsQuery = useEc2SubnetsQuery()
  const subnets = subnetsQuery.data ?? []

  const igwsQuery = useEc2InternetGatewaysQuery()
  const igws = igwsQuery.data ?? []

  const rtbsQuery = useEc2RouteTablesQuery()
  const rtbs = rtbsQuery.data ?? []

  const eipsQuery = useEc2ElasticIpsQuery()
  const eips = eipsQuery.data ?? []

  const deleteIgwMut = useDeleteInternetGatewayMutation()
  const deleteRtbMut = useDeleteRouteTableMutation()
  const releaseEipMut = useReleaseElasticIpMutation()
  const attachIgwMut = useAttachInternetGatewayMutation()
  const modifySubnetAttrMut = useModifySubnetAttributeMutation()
  const modifyVpcAttrMut = useModifyVpcAttributeMutation()
  const associateEipMut = useAssociateElasticIpMutation()
  const disassociateEipMut = useDisassociateElasticIpMutation()

  const [selection, setSelection] = useState<Selection | null>(null)
  const [instanceTab, setInstanceTab] = useState<'details' | 'tags' | 'console'>('details')
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(['amis', 'sgs', 'kps', 'vpcs', 'subnets', 'igws', 'rtbs', 'eips'])
  )

  function toggleSection(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Create modals
  const [showCreateInstance, setShowCreateInstance] = useState(false)
  const [showCreateAmi, setShowCreateAmi] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [showCreateSg, setShowCreateSg] = useState(false)
  const [showCreateKp, setShowCreateKp] = useState(false)
  const [showCreateVpc, setShowCreateVpc] = useState(false)
  const [showVpcWizard, setShowVpcWizard] = useState(false)
  const [showCreateSubnet, setShowCreateSubnet] = useState(false)
  const [showCreateIgw, setShowCreateIgw] = useState(false)
  const [showCreateRtb, setShowCreateRtb] = useState(false)
  const [showAllocateEip, setShowAllocateEip] = useState(false)
  const [pemMaterial, setPemMaterial] = useState<Ec2KeyPairMaterial | null>(null)

  // IGW attach local state
  const [igwAttachTarget, setIgwAttachTarget] = useState('')
  // EIP associate local state
  const [eipAssociateTarget, setEipAssociateTarget] = useState('')
  // SG rules edit modal
  const [editSgModal, setEditSgModal] = useState<'ingress' | 'egress' | null>(null)

  // Lifecycle confirms (instances only — use inline pattern)
  const [confirmTerminate, setConfirmTerminate] = useState(false)
  const [confirmDeregister, setConfirmDeregister] = useState(false)
  // Delete modal — single generic modal replaces all per-resource confirm states
  type DeleteTarget = 'sg' | 'kp' | 'vpc' | 'subnet' | 'igw' | 'rtb' | 'eip'
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const closeDeleteModal = () => setDeleteTarget(null)

  // Selected resource data
  const selectedInstanceId = selection?.kind === 'instance' ? selection.id : null
  const instanceQuery = useEc2InstanceQuery(selectedInstanceId)
  const selectedInstance = instanceQuery.data ?? instances.find((i) => i.instanceId === selectedInstanceId) ?? null

  const selectedAmi = selection?.kind === 'ami' ? amis.find((a) => a.imageId === selection.id) ?? null : null
  const selectedSg = selection?.kind === 'sg' ? sgs.find((s) => s.groupId === selection.id) ?? null : null
  const selectedKp = selection?.kind === 'kp' ? kps.find((k) => k.keyName === selection.name) ?? null : null
  const selectedVpc = selection?.kind === 'vpc' ? vpcs.find((v) => v.vpcId === selection.id) ?? null : null
  const selectedSubnet = selection?.kind === 'subnet' ? subnets.find((s) => s.subnetId === selection.id) ?? null : null
  const selectedIgw = selection?.kind === 'igw' ? igws.find((g) => g.internetGatewayId === selection.id) ?? null : null
  const selectedRtb = selection?.kind === 'rtb' ? rtbs.find((r) => r.routeTableId === selection.id) ?? null : null
  const selectedEip = selection?.kind === 'eip' ? eips.find((e) => e.allocationId === selection.id) ?? null : null

  // VPC attributes (DNS settings) — only fetch when a VPC is selected
  const vpcAttrsQuery = useEc2VpcAttributesQuery(selectedVpc?.vpcId)
  const vpcAttrs = vpcAttrsQuery.data ?? null

  // ── Guard derivations ──────────────────────────────────────────────────────
  const activeInstances = instances.filter((i) => i.state !== 'terminated' && i.state !== 'shutting-down')

  const sgInUse = selectedSg
    ? activeInstances.some((i) => i.securityGroups.some((s) => s.id === selectedSg.groupId))
    : false

  const subnetInUse = selectedSubnet
    ? activeInstances.some((i) => i.subnetId === selectedSubnet.subnetId)
    : false

  const igwAttached = selectedIgw ? selectedIgw.attachments.length > 0 : false
  const igwAttachedVpc = selectedIgw?.attachments[0]?.vpcId ?? null

  const rtbIsMain = selectedRtb ? selectedRtb.associations.some((a) => a.isMain) : false
  const rtbSubnetAssocCount = selectedRtb
    ? selectedRtb.associations.filter((a) => !a.isMain && a.subnetId).length
    : 0

  const vpcHasActiveInstances = selectedVpc
    ? activeInstances.some((i) => i.vpcId === selectedVpc.vpcId)
    : false
  const vpcSubnetCount = selectedVpc ? subnets.filter((s) => s.vpcId === selectedVpc.vpcId).length : 0
  const vpcIgwCount = selectedVpc ? igws.filter((g) => g.attachments.some((a) => a.vpcId === selectedVpc.vpcId)).length : 0
  const vpcRtbCount = selectedVpc ? rtbs.filter((r) => r.vpcId === selectedVpc.vpcId && !r.associations.some((a) => a.isMain)).length : 0

  useEffect(() => {
    if (selection?.kind === 'instance') setInstanceTab('details')
  }, [selection])

  // Mutations
  const startMut = useMutation({
    mutationFn: (id: string) => startEc2Instance(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances })
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instance(id) })
    },
  })
  const stopMut = useMutation({
    mutationFn: (id: string) => stopEc2Instance(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances })
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instance(id) })
    },
  })
  const rebootMut = useMutation({
    mutationFn: (id: string) => rebootEc2Instance(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances })
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instance(id) })
    },
  })
  const terminateMut = useMutation({
    mutationFn: (id: string) => terminateEc2Instance(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances })
      setSelection(null)
      setConfirmTerminate(false)
    },
  })
  const deregisterMut = useMutation({
    mutationFn: (id: string) => deregisterEc2Ami(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.amis })
      setSelection(null)
      setConfirmDeregister(false)
    },
  })
  const deleteSgMut = useMutation({
    mutationFn: (id: string) => deleteEc2SecurityGroup(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ec2', 'security-groups'] }) },
  })
  const deleteKpMut = useMutation({
    mutationFn: (name: string) => deleteEc2KeyPair(name),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ec2QueryKeys.keyPairs }) },
  })
  const deleteVpcMut = useMutation({
    mutationFn: (id: string) => deleteEc2Vpc(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.vpcs })
      void qc.invalidateQueries({ queryKey: ['ec2', 'subnets'] })
      void qc.invalidateQueries({ queryKey: ['ec2', 'security-groups'] })
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.internetGateways })
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTables() })
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.elasticIps })
    },
  })
  const deleteSubnetMut = useMutation({
    mutationFn: (id: string) => deleteEc2Subnet(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ec2', 'subnets'] }) },
  })
  const anyLifecyclePending = startMut.isPending || stopMut.isPending || rebootMut.isPending || terminateMut.isPending

  function handleRefresh() {
    void instancesQuery.refetch()
    void amisQuery.refetch()
    void sgsQuery.refetch()
    void kpsQuery.refetch()
    void vpcsQuery.refetch()
    void subnetsQuery.refetch()
    if (selectedInstanceId) void instanceQuery.refetch()
  }

  // ── Console output query (only when console modal open) ──
  const consoleQuery = useEc2ConsoleOutputQuery(showConsole && selectedInstanceId ? selectedInstanceId : null)

  return (
    <>
      {/* ── Modals ── */}
      {showCreateInstance && (
        <CreateInstanceModal
          onClose={() => setShowCreateInstance(false)}
          onCreated={() => void instancesQuery.refetch()}
        />
      )}
      {showCreateAmi && selectedInstance && (
        <CreateAmiModal
          instanceId={selectedInstance.instanceId}
          instanceName={selectedInstance.name}
          onClose={() => setShowCreateAmi(false)}
          onCreated={() => void amisQuery.refetch()}
        />
      )}
      {showCreateSg && <CreateSgModal onClose={() => setShowCreateSg(false)} onCreated={() => {}} />}
      {editSgModal && selectedSg && (
        <EditSgRulesModal
          groupId={selectedSg.groupId}
          direction={editSgModal}
          rules={editSgModal === 'ingress' ? selectedSg.inboundRules : selectedSg.outboundRules}
          onDone={() => setEditSgModal(null)}
        />
      )}
      {showCreateKp && (
        <CreateKpModal
          onClose={() => setShowCreateKp(false)}
          onCreated={(m) => setPemMaterial(m)}
        />
      )}
      {showCreateVpc && <CreateVpcModal onClose={() => setShowCreateVpc(false)} onCreated={() => {}} />}
      {showVpcWizard && <VpcWizardModal onClose={() => setShowVpcWizard(false)} />}
      {showCreateSubnet && <CreateSubnetModal onClose={() => setShowCreateSubnet(false)} onCreated={() => {}} />}
      {showCreateIgw && (
        <CreateIgwModal
          onClose={() => setShowCreateIgw(false)}
          onCreated={(igw) => setSelection({ kind: 'igw', id: igw.internetGatewayId })}
        />
      )}
      {showCreateRtb && (
        <CreateRtbModal
          onClose={() => setShowCreateRtb(false)}
          onCreated={(rtb) => setSelection({ kind: 'rtb', id: rtb.routeTableId })}
        />
      )}
      {showAllocateEip && (
        <AllocateEipModal
          onClose={() => setShowAllocateEip(false)}
          onAllocated={(eip) => setSelection({ kind: 'eip', id: eip.allocationId })}
        />
      )}
      {pemMaterial && <PemDisplay material={pemMaterial} onDismiss={() => setPemMaterial(null)} />}

      {/* ── Delete confirm modal ── */}
      {deleteTarget === 'sg' && selectedSg && (
        <ConfirmDeleteModal
          title="Delete Security Group"
          resourceId={selectedSg.groupId}
          subtitle={[selectedSg.groupName, selectedSg.description].filter(Boolean).join(' · ')}
          isPending={deleteSgMut.isPending}
          onClose={closeDeleteModal}
          onConfirm={() => deleteSgMut.mutateAsync(selectedSg.groupId)
            .then(() => { setSelection(null); closeDeleteModal() })}
        />
      )}
      {deleteTarget === 'kp' && selectedKp && (
        <ConfirmDeleteModal
          title="Delete Key Pair"
          resourceId={selectedKp.keyName}
          subtitle={selectedKp.keyPairId}
          isPending={deleteKpMut.isPending}
          onClose={closeDeleteModal}
          onConfirm={() => deleteKpMut.mutateAsync(selectedKp.keyName)
            .then(() => { setSelection(null); closeDeleteModal() })}
        />
      )}
      {deleteTarget === 'vpc' && selectedVpc && (
        <ConfirmDeleteModal
          title="Delete VPC"
          resourceId={selectedVpc.vpcId}
          subtitle={[
            selectedVpc.tags.find((t) => t.key === 'Name')?.value,
            selectedVpc.cidrBlock,
            selectedVpc.isDefault ? 'default' : undefined,
          ].filter(Boolean).join(' · ')}
          warnings={[
            ...(vpcIgwCount > 0 ? [`${vpcIgwCount} internet gateway${vpcIgwCount !== 1 ? 's' : ''} will be detached and deleted`] : []),
            ...(vpcSubnetCount > 0 ? [`${vpcSubnetCount} subnet${vpcSubnetCount !== 1 ? 's' : ''} will be deleted`] : []),
            ...(vpcRtbCount > 0 ? [`${vpcRtbCount} non-main route table${vpcRtbCount !== 1 ? 's' : ''} will be deleted`] : []),
          ]}
          isPending={deleteVpcMut.isPending}
          onClose={closeDeleteModal}
          onConfirm={() => deleteVpcMut.mutateAsync(selectedVpc.vpcId)
            .then(() => { setSelection(null); closeDeleteModal() })}
        />
      )}
      {deleteTarget === 'subnet' && selectedSubnet && (
        <ConfirmDeleteModal
          title="Delete Subnet"
          resourceId={selectedSubnet.subnetId}
          subtitle={[
            selectedSubnet.tags.find((t) => t.key === 'Name')?.value,
            selectedSubnet.cidrBlock,
            selectedSubnet.availabilityZone,
          ].filter(Boolean).join(' · ')}
          isPending={deleteSubnetMut.isPending}
          onClose={closeDeleteModal}
          onConfirm={() => deleteSubnetMut.mutateAsync(selectedSubnet.subnetId)
            .then(() => { setSelection(null); closeDeleteModal() })}
        />
      )}
      {deleteTarget === 'igw' && selectedIgw && (
        <ConfirmDeleteModal
          title="Delete Internet Gateway"
          resourceId={selectedIgw.internetGatewayId}
          subtitle={[
            selectedIgw.tags.find((t) => t.key === 'Name')?.value,
            igwAttached ? `attached to ${igwAttachedVpc}` : 'detached',
          ].filter(Boolean).join(' · ')}
          warnings={igwAttached ? [`Attached to ${igwAttachedVpc} — will be detached first`] : []}
          isPending={deleteIgwMut.isPending}
          onClose={closeDeleteModal}
          onConfirm={() => deleteIgwMut.mutateAsync(selectedIgw.internetGatewayId)
            .then(() => { setSelection(null); closeDeleteModal() })}
        />
      )}
      {deleteTarget === 'rtb' && selectedRtb && (
        <ConfirmDeleteModal
          title="Delete Route Table"
          resourceId={selectedRtb.routeTableId}
          subtitle={[
            selectedRtb.tags.find((t) => t.key === 'Name')?.value,
            selectedRtb.vpcId,
          ].filter(Boolean).join(' · ')}
          warnings={rtbSubnetAssocCount > 0 ? [`Associated with ${rtbSubnetAssocCount} subnet${rtbSubnetAssocCount !== 1 ? 's' : ''} — associations will be removed`] : []}
          isPending={deleteRtbMut.isPending}
          onClose={closeDeleteModal}
          onConfirm={() => deleteRtbMut.mutateAsync(selectedRtb.routeTableId)
            .then(() => { setSelection(null); closeDeleteModal() })}
        />
      )}
      {deleteTarget === 'eip' && selectedEip && (
        <ConfirmDeleteModal
          title="Release Elastic IP"
          resourceId={selectedEip.allocationId}
          subtitle={[
            selectedEip.publicIp,
            selectedEip.tags.find((t) => t.key === 'Name')?.value,
          ].filter(Boolean).join(' · ')}
          isPending={releaseEipMut.isPending}
          onClose={closeDeleteModal}
          onConfirm={() => releaseEipMut.mutateAsync(selectedEip.allocationId)
            .then(() => { setSelection(null); closeDeleteModal() })}
        />
      )}

      {/* ── Console output modal ── */}
      {showConsole && selectedInstanceId && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowConsole(false) }}>
          <div className="create-table-modal" style={{ maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Terminal size={14} />
              Console output — {selectedInstanceId}
            </h3>
            {consoleQuery.isLoading && <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Loading…</p>}
            {consoleQuery.isError && (
              <p style={{ fontSize: 12, color: '#f87171' }}>
                {consoleQuery.error instanceof Error ? consoleQuery.error.message : 'Failed to fetch console output.'}
              </p>
            )}
            {consoleQuery.data && (
              <>
                {consoleQuery.data.timestamp && (
                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 8px' }}>
                    As of {new Date(consoleQuery.data.timestamp).toLocaleString()}
                  </p>
                )}
                <pre className="mono" style={{
                  flex: 1, overflowY: 'auto', background: 'var(--surface-2)',
                  padding: 12, borderRadius: 4, fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {consoleQuery.data.output || '(no output yet)'}
                </pre>
              </>
            )}
            <div className="modal-footer" style={{ marginTop: 12 }}>
              <button className="button" onClick={() => setShowConsole(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="page-header">
        <div className="page-title">
          <h2>EC2 &amp; VPC</h2>
          <span className="info-link">
            <Info size={11} />
            Instances &amp; networking
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Instance lifecycle */}
          {selection?.kind === 'instance' && selectedInstance && (
            <>
              <button className="button" disabled={!canStart(selectedInstance.state) || anyLifecyclePending}
                onClick={() => startMut.mutate(selectedInstance.instanceId)}>
                {startMut.isPending ? <Loader2 size={13} /> : <Play size={13} />}
                Start
              </button>
              <button className="button" disabled={!canStop(selectedInstance.state) || anyLifecyclePending}
                onClick={() => stopMut.mutate(selectedInstance.instanceId)}>
                {stopMut.isPending ? <Loader2 size={13} /> : <Square size={13} />}
                Stop
              </button>
              <button className="button" disabled={!canReboot(selectedInstance.state) || anyLifecyclePending}
                onClick={() => rebootMut.mutate(selectedInstance.instanceId)}>
                {rebootMut.isPending ? <Loader2 size={13} /> : <RotateCcw size={13} />}
                Reboot
              </button>
              <button className="button" onClick={() => setShowCreateAmi(true)}>
                <HardDrive size={13} />
                Create AMI
              </button>
              <button className="button" onClick={() => setShowConsole(true)}>
                <Terminal size={13} />
                Console
              </button>
              {confirmTerminate ? (
                <>
                  <button className="button danger" onClick={() => terminateMut.mutate(selectedInstance.instanceId)}
                    disabled={terminateMut.isPending}>
                    {terminateMut.isPending ? <Loader2 size={13} /> : <Trash2 size={13} />}
                    Confirm terminate
                  </button>
                  <button className="button" onClick={() => setConfirmTerminate(false)}>Cancel</button>
                </>
              ) : (
                <button className="button danger" disabled={!canTerminate(selectedInstance.state) || anyLifecyclePending}
                  onClick={() => setConfirmTerminate(true)}>
                  <Trash2 size={13} />
                  Terminate
                </button>
              )}
            </>
          )}

          {/* AMI deregister */}
          {selection?.kind === 'ami' && selectedAmi && (
            confirmDeregister ? (
              <>
                <button className="button danger" onClick={() => deregisterMut.mutate(selectedAmi.imageId)}
                  disabled={deregisterMut.isPending}>
                  {deregisterMut.isPending ? <Loader2 size={13} /> : <Trash2 size={13} />}
                  Confirm deregister
                </button>
                <button className="button" onClick={() => setConfirmDeregister(false)}>Cancel</button>
              </>
            ) : (
              <button className="button danger" onClick={() => setConfirmDeregister(true)}>
                <Trash2 size={13} />
                Deregister
              </button>
            )
          )}

          {/* SG delete */}
          {selection?.kind === 'sg' && selectedSg && (
            <button className="button danger" onClick={() => setDeleteTarget('sg')}
              disabled={sgInUse}
              title={sgInUse ? 'In use by one or more instances' : undefined}>
              <Trash2 size={13} /> Delete
            </button>
          )}

          {/* KP delete */}
          {selection?.kind === 'kp' && selectedKp && (
            <button className="button danger" onClick={() => setDeleteTarget('kp')}>
              <Trash2 size={13} /> Delete
            </button>
          )}

          {/* VPC delete */}
          {selection?.kind === 'vpc' && selectedVpc && (
            <button className="button danger" onClick={() => setDeleteTarget('vpc')}
              disabled={selectedVpc.isDefault || vpcHasActiveInstances}
              title={
                selectedVpc.isDefault ? 'Default VPC — cannot be deleted' :
                vpcHasActiveInstances ? 'Has active instances — terminate them first' :
                undefined
              }>
              <Trash2 size={13} /> Delete VPC
            </button>
          )}

          {/* Subnet delete */}
          {selection?.kind === 'subnet' && selectedSubnet && (
            <button className="button danger" onClick={() => setDeleteTarget('subnet')}
              disabled={subnetInUse}
              title={subnetInUse ? 'Contains active instances — terminate them first' : undefined}>
              <Trash2 size={13} /> Delete
            </button>
          )}

          {/* IGW delete */}
          {selection?.kind === 'igw' && selectedIgw && (
            <button className="button danger" onClick={() => setDeleteTarget('igw')}>
              <Trash2 size={13} /> Delete IGW
            </button>
          )}

          {/* Route Table delete */}
          {selection?.kind === 'rtb' && selectedRtb && (
            <button className="button danger" onClick={() => setDeleteTarget('rtb')}
              disabled={rtbIsMain}
              title={rtbIsMain ? 'Main route table — cannot be deleted' : undefined}>
              <Trash2 size={13} /> Delete RTB
            </button>
          )}

          {/* EIP release */}
          {selection?.kind === 'eip' && selectedEip && (
            <button className="button danger"
              disabled={!!selectedEip.associationId}
              title={selectedEip.associationId ? 'Disassociate from instance first' : undefined}
              onClick={() => setDeleteTarget('eip')}>
              <Trash2 size={13} /> Release EIP
            </button>
          )}

          <button className="button" onClick={handleRefresh} type="button">
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Split ── */}
      <div className="split">
        {/* ── Left: resource list ── */}
        <aside className="list-pane">

          {/* Instances */}
          <div className="widget-header">
            <Server size={13} color="#8d9cad" />
            <h3>Instances ({instances.length})</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="icon-btn" title="Launch instance"
                onClick={() => setShowCreateInstance(true)}>
                <Plus size={13} />
              </button>
              <button className="icon-btn" onClick={() => toggleSection('instances')}>
                {collapsed.has('instances') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          {!collapsed.has('instances') && (instancesQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : instances.length === 0 ? (
            <div className="empty compact"><p>No instances.</p></div>
          ) : (
            instances.map((i) => (
              <button key={i.instanceId} type="button"
                className={`list-item ${selection?.kind === 'instance' && selection.id === i.instanceId ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'instance', id: i.instanceId }); setConfirmTerminate(false) }}>
                <strong>{i.name}</strong>
                <span>{i.instanceType ?? 'unknown'} · {i.state ?? '-'}</span>
              </button>
            ))
          ))}

          {/* AMIs */}
          <div className="widget-header" style={{ marginTop: 16 }}>
            <HardDrive size={13} color="#8d9cad" />
            <h3>AMIs ({amis.length})</h3>
            <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => toggleSection('amis')}>
              {collapsed.has('amis') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
          {!collapsed.has('amis') && (amisQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : amis.length === 0 ? (
            <div className="empty compact"><p>No AMIs.</p></div>
          ) : (
            amis.map((a) => (
              <button key={a.imageId} type="button"
                className={`list-item ${selection?.kind === 'ami' && selection.id === a.imageId ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'ami', id: a.imageId }); setConfirmDeregister(false) }}>
                <strong>{a.name}</strong>
                <span>{a.imageId} · {a.state ?? '-'}</span>
              </button>
            ))
          ))}

          {/* Security Groups */}
          <div className="widget-header" style={{ marginTop: 16 }}>
            <Network size={13} color="#8d9cad" />
            <h3>Security Groups ({sgs.length})</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="icon-btn" title="Create security group"
                onClick={() => setShowCreateSg(true)}>
                <Plus size={13} />
              </button>
              <button className="icon-btn" onClick={() => toggleSection('sgs')}>
                {collapsed.has('sgs') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          {!collapsed.has('sgs') && (sgsQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : sgs.length === 0 ? (
            <div className="empty compact"><p>No security groups.</p></div>
          ) : (
            sgs.map((sg) => (
              <button key={sg.groupId} type="button"
                className={`list-item ${selection?.kind === 'sg' && selection.id === sg.groupId ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'sg', id: sg.groupId }) }}>
                <strong>{sg.groupName}</strong>
                <span>{sg.groupId} · {sg.vpcId ?? 'no VPC'}</span>
              </button>
            ))
          ))}

          {/* Key Pairs */}
          <div className="widget-header" style={{ marginTop: 16 }}>
            <Key size={13} color="#8d9cad" />
            <h3>Key Pairs ({kps.length})</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="icon-btn" title="Create key pair"
                onClick={() => setShowCreateKp(true)}>
                <Plus size={13} />
              </button>
              <button className="icon-btn" onClick={() => toggleSection('kps')}>
                {collapsed.has('kps') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          {!collapsed.has('kps') && (kpsQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : kps.length === 0 ? (
            <div className="empty compact"><p>No key pairs.</p></div>
          ) : (
            kps.map((kp) => (
              <button key={kp.keyPairId} type="button"
                className={`list-item ${selection?.kind === 'kp' && selection.name === kp.keyName ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'kp', name: kp.keyName }) }}>
                <strong>{kp.keyName}</strong>
                <span className="mono" style={{ fontSize: 10 }}>{kp.keyPairId}</span>
              </button>
            ))
          ))}

          {/* ── Networking group header ─────────────────────────────────── */}
          <div style={{
            marginTop: 20,
            marginBottom: 4,
            paddingLeft: 8,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            userSelect: 'none',
          }}>
            Networking
          </div>

          {/* VPCs */}
          <div className="widget-header" style={{ marginTop: 4 }}>
            <Globe size={13} color="#8d9cad" />
            <h3>VPCs ({vpcs.length})</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="icon-btn" title="VPC Wizard — create VPC with IGW, subnets, route tables"
                onClick={() => setShowVpcWizard(true)}>
                <Wand2 size={13} />
              </button>
              <button className="icon-btn" title="Create VPC (simple)"
                onClick={() => setShowCreateVpc(true)}>
                <Plus size={13} />
              </button>
              <button className="icon-btn" onClick={() => toggleSection('vpcs')}>
                {collapsed.has('vpcs') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          {!collapsed.has('vpcs') && (vpcsQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : vpcs.length === 0 ? (
            <div className="empty compact"><p>No VPCs.</p></div>
          ) : (
            vpcs.map((v) => (
              <button key={v.vpcId} type="button"
                className={`list-item ${selection?.kind === 'vpc' && selection.id === v.vpcId ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'vpc', id: v.vpcId }) }}>
                <strong className="mono">{v.vpcId}</strong>
                <span>{v.cidrBlock}{v.isDefault ? ' — default' : ''}</span>
              </button>
            ))
          ))}

          {/* Subnets */}
          <div className="widget-header" style={{ marginTop: 16 }}>
            <Layers size={13} color="#8d9cad" />
            <h3>Subnets ({subnets.length})</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="icon-btn" title="Create subnet"
                onClick={() => setShowCreateSubnet(true)}>
                <Plus size={13} />
              </button>
              <button className="icon-btn" onClick={() => toggleSection('subnets')}>
                {collapsed.has('subnets') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          {!collapsed.has('subnets') && (subnetsQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : subnets.length === 0 ? (
            <div className="empty compact"><p>No subnets.</p></div>
          ) : (
            subnets.map((s) => (
              <button key={s.subnetId} type="button"
                className={`list-item ${selection?.kind === 'subnet' && selection.id === s.subnetId ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'subnet', id: s.subnetId }) }}>
                <strong className="mono">{s.subnetId}</strong>
                <span>{s.cidrBlock} · {s.availabilityZone}</span>
              </button>
            ))
          ))}

          {/* Internet Gateways */}
          <div className="widget-header" style={{ marginTop: 8 }}>
            <Cloud size={13} color="#8d9cad" />
            <h3>Internet Gateways ({igws.length})</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="icon-btn" title="Create Internet Gateway" onClick={() => setShowCreateIgw(true)}>
                <Plus size={13} />
              </button>
              <button className="icon-btn" onClick={() => toggleSection('igws')}>
                {collapsed.has('igws') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          {!collapsed.has('igws') && (igwsQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : igws.length === 0 ? (
            <div className="empty compact"><p>No internet gateways.</p></div>
          ) : (
            igws.map((g) => (
              <button key={g.internetGatewayId} type="button"
                className={`list-item ${selection?.kind === 'igw' && selection.id === g.internetGatewayId ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'igw', id: g.internetGatewayId }) }}>
                <strong className="mono">{g.internetGatewayId}</strong>
                <span>{g.attachments.length > 0 ? `attached to ${g.attachments[0].vpcId}` : 'detached'}</span>
              </button>
            ))
          ))}

          {/* Route Tables */}
          <div className="widget-header" style={{ marginTop: 8 }}>
            <Router size={13} color="#8d9cad" />
            <h3>Route Tables ({rtbs.length})</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="icon-btn" title="Create Route Table" onClick={() => setShowCreateRtb(true)}>
                <Plus size={13} />
              </button>
              <button className="icon-btn" onClick={() => toggleSection('rtbs')}>
                {collapsed.has('rtbs') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          {!collapsed.has('rtbs') && (rtbsQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : rtbs.length === 0 ? (
            <div className="empty compact"><p>No route tables.</p></div>
          ) : (
            rtbs.map((r) => (
              <button key={r.routeTableId} type="button"
                className={`list-item ${selection?.kind === 'rtb' && selection.id === r.routeTableId ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'rtb', id: r.routeTableId }) }}>
                <strong className="mono">{r.routeTableId}</strong>
                <span>{r.vpcId} · {r.routes.length} routes</span>
              </button>
            ))
          ))}

          {/* Elastic IPs */}
          <div className="widget-header" style={{ marginTop: 8 }}>
            <Network size={13} color="#8d9cad" />
            <h3>Elastic IPs ({eips.length})</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="icon-btn" title="Allocate Elastic IP" onClick={() => setShowAllocateEip(true)}>
                <Plus size={13} />
              </button>
              <button className="icon-btn" onClick={() => toggleSection('eips')}>
                {collapsed.has('eips') ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          {!collapsed.has('eips') && (eipsQuery.isLoading ? (
            <div className="empty compact"><p>Loading…</p></div>
          ) : eips.length === 0 ? (
            <div className="empty compact"><p>No elastic IPs.</p></div>
          ) : (
            eips.map((e) => (
              <button key={e.allocationId} type="button"
                className={`list-item ${selection?.kind === 'eip' && selection.id === e.allocationId ? 'active' : ''}`}
                onClick={() => { setSelection({ kind: 'eip', id: e.allocationId }) }}>
                <strong className="mono">{e.publicIp}</strong>
                <span>{e.allocationId}</span>
              </button>
            ))
          ))}
        </aside>

        {/* ── Right: detail pane ── */}
        <section className="detail-pane">
          {!selection ? (
            <EmptyState icon={Server} title="Select a resource" description="Choose an instance, AMI, security group, key pair, VPC, subnet, internet gateway, route table, or elastic IP." />
          ) : selection.kind === 'instance' ? (
            !selectedInstance ? (
              <div className="empty compact"><p>Loading…</p></div>
            ) : (
              <>
                <div className="page-header" style={{ borderBottom: 'none' }}>
                  <div className="page-title">
                    <h2 style={{ fontSize: 16 }}>{selectedInstance.name}</h2>
                    <span className={`status ${stateClass(selectedInstance.state)}`}>
                      {selectedInstance.state ?? 'unknown'}
                    </span>
                  </div>
                </div>

                <div className="sns-tabs" style={{ paddingLeft: 20 }}>
                  <button className={`sns-tab${instanceTab === 'details' ? ' active' : ''}`} onClick={() => setInstanceTab('details')}>Details</button>
                  <button className={`sns-tab${instanceTab === 'tags' ? ' active' : ''}`} onClick={() => setInstanceTab('tags')}>Tags</button>
                  <button className={`sns-tab${instanceTab === 'console' ? ' active' : ''}`} onClick={() => setInstanceTab('console')}>Console</button>
                </div>

                {instanceTab === 'details' && (
                  <div className="content" style={{ paddingTop: 12 }}>
                    <div className="grid two">
                      <div className="widget">
                        <div className="widget-header">
                          <Server size={13} color="var(--accent)" />
                          <h3>Instance</h3>
                        </div>
                        <div className="widget-body">
                          <div className="meta-grid">
                            <Meta label="Instance ID" value={selectedInstance.instanceId} />
                            <Meta label="State" value={selectedInstance.state ?? 'unknown'} />
                            <Meta label="Type" value={selectedInstance.instanceType ?? '-'} />
                            <Meta label="Architecture" value={selectedInstance.architecture ?? '-'} />
                            <Meta label="Platform" value={selectedInstance.platform ?? 'Linux/UNIX'} />
                            <Meta label="AMI ID" value={selectedInstance.imageId ?? '-'} />
                            <Meta label="Key pair" value={selectedInstance.keyName ?? '-'} />
                            <Meta label="Launch time" value={selectedInstance.launchTime ? new Date(selectedInstance.launchTime).toLocaleString() : '-'} />
                          </div>
                        </div>
                      </div>
                      <div className="widget">
                        <div className="widget-header">
                          <Network size={13} color="var(--accent)" />
                          <h3>Networking</h3>
                        </div>
                        <div className="widget-body">
                          <div className="meta-grid">
                            <Meta label="Availability zone" value={selectedInstance.availabilityZone ?? '-'} />
                            <Meta label="VPC ID" value={selectedInstance.vpcId ?? '-'} />
                            <Meta label="Subnet ID" value={selectedInstance.subnetId ?? '-'} />
                            <Meta label="Public IP" value={selectedInstance.publicIpAddress ?? '-'} />
                            <Meta label="Private IP" value={selectedInstance.privateIpAddress ?? '-'} />
                          </div>
                        </div>
                      </div>
                      {selectedInstance.securityGroups.length > 0 && (
                        <div className="table-panel section-space">
                          <div className="widget-header">
                            <Network size={13} color="#8d9cad" />
                            <h3>Security groups</h3>
                          </div>
                          <table className="table">
                            <thead><tr><th>ID</th><th>Name</th></tr></thead>
                            <tbody>
                              {selectedInstance.securityGroups.map((sg) => (
                                <tr key={sg.id ?? sg.name}>
                                  <td className="mono">{sg.id ?? '-'}</td>
                                  <td>{sg.name ?? '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {instanceTab === 'tags' && (
                  <div className="content" style={{ paddingTop: 12 }}>
                    <div className="widget">
                      <div className="widget-header">
                        <h3>Tags</h3>
                      </div>
                      <div className="widget-body">
                        <TagEditor instanceId={selectedInstance.instanceId} initialTags={selectedInstance.tags} />
                      </div>
                    </div>
                  </div>
                )}

                {instanceTab === 'console' && (
                  <div className="content" style={{ paddingTop: 12 }}>
                    <div className="widget">
                      <div className="widget-header">
                        <Terminal size={13} color="var(--accent)" />
                        <h3>Console output</h3>
                        <button className="button" style={{ marginLeft: 'auto' }} onClick={() => setShowConsole(true)}>
                          <Terminal size={13} />
                          Open console
                        </button>
                      </div>
                      <div className="widget-body">
                        <p style={{ fontSize: 12, color: '#5f7080', margin: 0 }}>
                          Click "Open console" to fetch the latest serial console output for this instance.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )
          ) : selection.kind === 'ami' ? (
            !selectedAmi ? (
              <div className="empty compact"><p>AMI not found.</p></div>
            ) : (
              <div className="content">
                <div className="page-title" style={{ marginBottom: 16 }}>
                  <HardDrive size={18} color="var(--accent)" />
                  <h2>{selectedAmi.name}</h2>
                  <span className={`status ${selectedAmi.state === 'available' ? 'healthy' : 'unknown'}`}>
                    {selectedAmi.state ?? '-'}
                  </span>
                </div>
                <div className="widget">
                  <div className="widget-header">
                    <HardDrive size={13} color="var(--accent)" />
                    <h3>Image</h3>
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <Meta label="AMI ID" value={selectedAmi.imageId} />
                      <Meta label="Name" value={selectedAmi.name} />
                      <Meta label="State" value={selectedAmi.state ?? '-'} />
                      <Meta label="Architecture" value={selectedAmi.architecture ?? '-'} />
                      <Meta label="Root device" value={selectedAmi.rootDeviceType ?? '-'} />
                      <Meta label="Created" value={selectedAmi.createdAt ? new Date(selectedAmi.createdAt).toLocaleString() : '-'} />
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : selection.kind === 'sg' ? (
            !selectedSg ? (
              <div className="empty compact"><p>Security group not found.</p></div>
            ) : (
              <div className="content">
                <div className="page-title" style={{ marginBottom: 16 }}>
                  <Network size={18} color="var(--accent)" />
                  <h2>{selectedSg.groupName}</h2>
                  <span className="mono" style={{ fontSize: 12, color: '#5f7080' }}>{selectedSg.groupId}</span>
                </div>
                <div className="widget" style={{ marginBottom: 12 }}>
                  <div className="widget-header">
                    <Network size={13} color="var(--accent)" />
                    <h3>Details</h3>
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <Meta label="Group ID" value={selectedSg.groupId} />
                      <Meta label="Description" value={selectedSg.description || '-'} />
                      <Meta label="VPC" value={selectedSg.vpcId ?? '-'} />
                    </div>
                  </div>
                </div>
                <div className="table-panel" style={{ marginBottom: 12 }}>
                  <div className="widget-header">
                    <Network size={13} color="#8d9cad" />
                    <h3>Inbound rules</h3>
                    <button className="button compact" style={{ marginLeft: 'auto' }}
                      onClick={() => setEditSgModal('ingress')}>Edit</button>
                  </div>
                  {selectedSg.inboundRules.length > 0 ? (
                    <table className="table">
                      <thead><tr><th>Protocol</th><th>From</th><th>To</th><th>Source</th><th /></tr></thead>
                      <tbody>
                        {selectedSg.inboundRules.map((rule, i) => (
                          <IngressRuleRow key={i} rule={rule} groupId={selectedSg.groupId}
                            onRevoked={() => void sgsQuery.refetch()} />
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty compact"><p>No inbound rules.</p></div>
                  )}
                </div>

                {/* Outbound rules */}
                <div className="table-panel">
                  <div className="widget-header">
                    <Network size={13} color="#8d9cad" />
                    <h3>Outbound rules</h3>
                    <button className="button compact" style={{ marginLeft: 'auto' }}
                      onClick={() => setEditSgModal('egress')}>Edit</button>
                  </div>
                  {selectedSg.outboundRules.length > 0 ? (
                    <table className="table">
                      <thead><tr><th>Protocol</th><th>From</th><th>To</th><th>Destination</th><th /></tr></thead>
                      <tbody>
                        {selectedSg.outboundRules.map((rule, i) => (
                          <EgressRuleRow key={i} rule={rule} groupId={selectedSg.groupId}
                            onRevoked={() => void sgsQuery.refetch()} />
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty compact"><p>No outbound rules.</p></div>
                  )}
                </div>
              </div>
            )
          ) : selection.kind === 'kp' ? (
            !selectedKp ? (
              <div className="empty compact"><p>Key pair not found.</p></div>
            ) : (
              <div className="content">
                <div className="page-title" style={{ marginBottom: 16 }}>
                  <Key size={18} color="var(--accent)" />
                  <h2>{selectedKp.keyName}</h2>
                </div>
                <div className="widget">
                  <div className="widget-header">
                    <Key size={13} color="var(--accent)" />
                    <h3>Key pair</h3>
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <Meta label="Key pair ID" value={selectedKp.keyPairId} />
                      <Meta label="Name" value={selectedKp.keyName} />
                      <Meta label="Fingerprint" value={(selectedKp as Ec2KeyPair).keyFingerprint ?? '-'} />
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : selection.kind === 'vpc' ? (
            !selectedVpc ? (
              <div className="empty compact"><p>VPC not found.</p></div>
            ) : (
              <div className="content">
                <div className="page-title" style={{ marginBottom: 16 }}>
                  <Globe size={18} color="var(--accent)" />
                  <h2>{selectedVpc.vpcId}</h2>
                  {selectedVpc.isDefault && <span className="status healthy" style={{ fontSize: 11 }}>default</span>}
                  <span className={`status ${selectedVpc.state === 'available' ? 'healthy' : 'unknown'}`}>
                    {selectedVpc.state ?? '-'}
                  </span>
                </div>
                <div className="widget">
                  <div className="widget-header">
                    <Globe size={13} color="var(--accent)" />
                    <h3>VPC</h3>
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <Meta label="VPC ID" value={selectedVpc.vpcId} />
                      <Meta label="CIDR block" value={selectedVpc.cidrBlock} />
                      <Meta label="State" value={selectedVpc.state ?? '-'} />
                      <Meta label="Default" value={selectedVpc.isDefault ? 'Yes' : 'No'} />
                    </div>
                  </div>
                </div>
                <div className="widget" style={{ marginTop: 12 }}>
                  <div className="widget-header">
                    <Network size={13} color="var(--accent)" />
                    <h3>DNS settings</h3>
                    {vpcAttrsQuery.isFetching && <Loader2 size={12} style={{ marginLeft: 6 }} />}
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <div className="meta-row">
                        <span className="meta-label">DNS hostnames</span>
                        <button
                          className={`button compact ${vpcAttrs?.enableDnsHostnames ? 'primary' : ''}`}
                          disabled={modifyVpcAttrMut.isPending || vpcAttrsQuery.isLoading}
                          onClick={() => modifyVpcAttrMut.mutate({
                            vpcId: selectedVpc.vpcId,
                            attribute: 'enableDnsHostnames',
                            value: !(vpcAttrs?.enableDnsHostnames ?? false),
                          })}
                        >
                          {vpcAttrs?.enableDnsHostnames ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                      <div className="meta-row">
                        <span className="meta-label">DNS support</span>
                        <button
                          className={`button compact ${vpcAttrs?.enableDnsSupport ? 'primary' : ''}`}
                          disabled={modifyVpcAttrMut.isPending || vpcAttrsQuery.isLoading}
                          onClick={() => modifyVpcAttrMut.mutate({
                            vpcId: selectedVpc.vpcId,
                            attribute: 'enableDnsSupport',
                            value: !(vpcAttrs?.enableDnsSupport ?? false),
                          })}
                        >
                          {vpcAttrs?.enableDnsSupport ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : selection.kind === 'subnet' ? (
            !selectedSubnet ? (
              <div className="empty compact"><p>Subnet not found.</p></div>
            ) : (
              <div className="content">
                <div className="page-title" style={{ marginBottom: 16 }}>
                  <Layers size={18} color="var(--accent)" />
                  <h2>{selectedSubnet.subnetId}</h2>
                  <span className={`status ${selectedSubnet.state === 'available' ? 'healthy' : 'unknown'}`}>
                    {selectedSubnet.state ?? '-'}
                  </span>
                </div>
                <div className="widget">
                  <div className="widget-header">
                    <Layers size={13} color="var(--accent)" />
                    <h3>Subnet</h3>
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <Meta label="Subnet ID" value={selectedSubnet.subnetId} />
                      <Meta label="VPC ID" value={selectedSubnet.vpcId} />
                      <Meta label="CIDR block" value={selectedSubnet.cidrBlock} />
                      <Meta label="Availability zone" value={selectedSubnet.availabilityZone} />
                      <Meta label="Available IPs" value={String(selectedSubnet.availableIpAddressCount ?? '-')} />
                      <Meta label="State" value={selectedSubnet.state ?? '-'} />
                      <div className="meta-row">
                        <span className="meta-label">Auto-assign public IP</span>
                        <button
                          className={`button compact ${selectedSubnet.mapPublicIpOnLaunch ? 'primary' : ''}`}
                          disabled={modifySubnetAttrMut.isPending}
                          onClick={() => modifySubnetAttrMut.mutate({
                            subnetId: selectedSubnet.subnetId,
                            mapPublicIpOnLaunch: !selectedSubnet.mapPublicIpOnLaunch,
                          })}
                        >
                          {selectedSubnet.mapPublicIpOnLaunch ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : selection.kind === 'igw' ? (
            !selectedIgw ? (
              <div className="empty compact"><p>Internet gateway not found.</p></div>
            ) : (
              <div className="content">
                <div className="page-title" style={{ marginBottom: 16 }}>
                  <Cloud size={18} color="var(--accent)" />
                  <h2>{selectedIgw.internetGatewayId}</h2>
                  {selectedIgw.attachments.length > 0
                    ? <span className="status healthy">attached</span>
                    : <span className="status unknown">detached</span>}
                </div>
                <div className="widget">
                  <div className="widget-header">
                    <Cloud size={13} color="var(--accent)" />
                    <h3>Internet Gateway</h3>
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <Meta label="IGW ID" value={selectedIgw.internetGatewayId} />
                      <Meta label="Name" value={selectedIgw.tags.find((t) => t.key === 'Name')?.value ?? '—'} />
                      <Meta label="Attached VPCs" value={
                        selectedIgw.attachments.length > 0
                          ? selectedIgw.attachments.map((a) => a.vpcId).join(', ')
                          : 'None'
                      } />
                      <Meta label="Attachment state" value={
                        selectedIgw.attachments.length > 0 ? selectedIgw.attachments[0].state : '—'
                      } />
                    </div>
                    {!igwAttached && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          className="input"
                          style={{ flex: 1 }}
                          value={igwAttachTarget}
                          onChange={(e) => setIgwAttachTarget(e.target.value)}
                        >
                          <option value="">— attach to VPC —</option>
                          {vpcs.filter((v) => !igws.some((g) => g.attachments.some((a) => a.vpcId === v.vpcId))).map((v) => (
                            <option key={v.vpcId} value={v.vpcId}>{v.vpcId} ({v.cidrBlock})</option>
                          ))}
                        </select>
                        <button
                          className="button primary"
                          disabled={!igwAttachTarget || attachIgwMut.isPending}
                          onClick={() => attachIgwMut.mutate({
                            igwId: selectedIgw.internetGatewayId,
                            vpcId: igwAttachTarget,
                          }, { onSuccess: () => setIgwAttachTarget('') })}
                        >
                          {attachIgwMut.isPending ? <Loader2 size={13} /> : <Cloud size={13} />}
                          Attach
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : selection.kind === 'rtb' ? (
            !selectedRtb ? (
              <div className="empty compact"><p>Route table not found.</p></div>
            ) : (
              <div className="content">
                <div className="page-title" style={{ marginBottom: 16 }}>
                  <Router size={18} color="var(--accent)" />
                  <h2>{selectedRtb.routeTableId}</h2>
                  {selectedRtb.associations.some((a) => a.isMain) && (
                    <span className="status healthy" style={{ fontSize: 11 }}>main</span>
                  )}
                </div>
                <div className="widget" style={{ marginBottom: 12 }}>
                  <div className="widget-header">
                    <Router size={13} color="var(--accent)" />
                    <h3>Route Table</h3>
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <Meta label="RTB ID" value={selectedRtb.routeTableId} />
                      <Meta label="VPC ID" value={selectedRtb.vpcId} />
                      <Meta label="Name" value={selectedRtb.tags.find((t) => t.key === 'Name')?.value ?? '—'} />
                      <Meta label="Main" value={selectedRtb.associations.some((a) => a.isMain) ? 'Yes' : 'No'} />
                    </div>
                  </div>
                </div>
                <RouteTableEditor
                  rtbId={selectedRtb.routeTableId}
                  routes={selectedRtb.routes}
                  associations={selectedRtb.associations}
                  igws={igws}
                  natGws={[]}
                  subnets={subnets}
                />
              </div>
            )
          ) : selection.kind === 'eip' ? (
            !selectedEip ? (
              <div className="empty compact"><p>Elastic IP not found.</p></div>
            ) : (
              <div className="content">
                <div className="page-title" style={{ marginBottom: 16 }}>
                  <Network size={18} color="var(--accent)" />
                  <h2>{selectedEip.publicIp}</h2>
                  {selectedEip.associationId
                    ? <span className="status degraded">associated</span>
                    : <span className="status healthy">unassociated</span>}
                </div>
                <div className="widget">
                  <div className="widget-header">
                    <Network size={13} color="var(--accent)" />
                    <h3>Elastic IP</h3>
                  </div>
                  <div className="widget-body">
                    <div className="meta-grid">
                      <Meta label="Allocation ID" value={selectedEip.allocationId} />
                      <Meta label="Public IP" value={selectedEip.publicIp} />
                      <Meta label="Domain" value={selectedEip.domain ?? '—'} />
                      <Meta label="Association ID" value={selectedEip.associationId ?? '—'} />
                      <Meta label="Instance ID" value={selectedEip.instanceId ?? '—'} />
                      <Meta label="Network interface" value={selectedEip.networkInterfaceId ?? '—'} />
                    </div>
                    {selectedEip.associationId ? (
                      <div style={{ marginTop: 12 }}>
                        <button
                          className="button danger"
                          disabled={disassociateEipMut.isPending}
                          onClick={() => disassociateEipMut.mutate({
                            allocationId: selectedEip.allocationId,
                            associationId: selectedEip.associationId!,
                          })}
                        >
                          {disassociateEipMut.isPending ? <Loader2 size={13} /> : <Trash2 size={13} />}
                          Disassociate
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          className="input"
                          style={{ flex: 1 }}
                          value={eipAssociateTarget}
                          onChange={(e) => setEipAssociateTarget(e.target.value)}
                        >
                          <option value="">— associate with instance —</option>
                          {activeInstances.map((i) => (
                            <option key={i.instanceId} value={i.instanceId}>
                              {i.name || i.instanceId} ({i.state})
                            </option>
                          ))}
                        </select>
                        <button
                          className="button primary"
                          disabled={!eipAssociateTarget || associateEipMut.isPending}
                          onClick={() => associateEipMut.mutate({
                            allocationId: selectedEip.allocationId,
                            instanceId: eipAssociateTarget,
                          }, { onSuccess: () => setEipAssociateTarget('') })}
                        >
                          {associateEipMut.isPending ? <Loader2 size={13} /> : <Plus size={13} />}
                          Associate
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : null}
        </section>
      </div>
    </>
  )
}
