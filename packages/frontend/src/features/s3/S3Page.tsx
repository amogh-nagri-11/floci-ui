import {useEffect, useRef, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
    ChevronRight,
    Copy,
    Database,
    File,
    FileText,
    Folder,
    FolderPlus,
    Image,
    Info,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    Settings,
    Tag,
    Trash2,
    Upload,
    X,
} from 'lucide-react'
import {EmptyState} from '@/components/EmptyState'
import {
    copyStorageObject,
    createCloudResource,
    deleteCloudResource,
    deleteStorageObject,
    listCloudResources,
    listStorageObjects,
    storageObjectDownloadUrl,
    uploadStorageObject,
} from '@/api/cloudProxyClient'
import {type S3ObjectMetadata, type S3Tag} from '@/api/aws/s3.api'
import {
    useBucketTagsQuery,
    useBucketVersioningQuery,
    useS3ObjectMetadataQuery,
    useS3ObjectTagsQuery,
} from '@/api/aws/s3.queries'
import {
    usePutBucketTagsMutation,
    usePutBucketVersioningMutation,
    usePutS3ObjectTagsMutation,
} from '@/api/aws/s3.mutations'
import type {CloudProvider} from '@/types/cloud'
import type {CloudResource, StorageObject} from '@/types/resource'
import {timeAgo} from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function basename(key: string, prefix: string) {
    return key.startsWith(prefix) ? key.slice(prefix.length) : key
}

function fileIcon(key: string) {
    const ext = key.split('.').pop()?.toLowerCase()
    if (!ext) return <File size={13} color="#8d9cad"/>
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext))
        return <Image size={13} color="#60a5fa"/>
    if (['json', 'xml', 'yaml', 'yml', 'toml', 'csv', 'txt', 'log', 'md'].includes(ext))
        return <FileText size={13} color="#a78bfa"/>
    return <File size={13} color="#8d9cad"/>
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({
    bucket,
    prefix,
    onRoot,
    onNavigate,
}: {
    bucket: string
    prefix: string
    onRoot: () => void
    onNavigate: (p: string) => void
}) {
    const segments = prefix
        ? prefix.replace(/\/$/, '').split('/').map((part, idx, arr) => ({
            label: part,
            path: arr.slice(0, idx + 1).join('/') + '/',
        }))
        : []

    return (
        <div className="breadcrumb">
            <button className="breadcrumb-btn" onClick={onRoot}>Root</button>
            <span className="breadcrumb-sep"><ChevronRight size={11}/></span>
            {segments.length === 0 ? (
                <span className="breadcrumb-current">{bucket}</span>
            ) : (
                <>
                    <button className="breadcrumb-btn" onClick={() => onNavigate('')}>{bucket}</button>
                    {segments.map((seg, i) => (
                        <span key={seg.path} style={{display: 'contents'}}>
                            <span className="breadcrumb-sep"><ChevronRight size={11}/></span>
                            {i === segments.length - 1 ? (
                                <span className="breadcrumb-current">{seg.label}</span>
                            ) : (
                                <button className="breadcrumb-btn" onClick={() => onNavigate(seg.path)}>
                                    {seg.label}
                                </button>
                            )}
                        </span>
                    ))}
                </>
            )}
        </div>
    )
}

// ─── MetaGrid (AWS only) ──────────────────────────────────────────────────────

function MetaGrid({meta}: { meta: S3ObjectMetadata }) {
    const rows: Array<{ label: string; value: string }> = [
        {label: 'Content-Type', value: meta.contentType ?? ''},
        {label: 'Size', value: meta.contentLength !== undefined ? formatBytes(meta.contentLength) : ''},
        {label: 'ETag', value: meta.etag ?? ''},
        {label: 'Last Modified', value: meta.lastModified ?? ''},
        {label: 'Version ID', value: meta.versionId ?? ''},
        {label: 'Cache-Control', value: meta.cacheControl ?? ''},
        {label: 'Encoding', value: meta.contentEncoding ?? ''},
        {label: 'Disposition', value: meta.contentDisposition ?? ''},
    ].filter((r) => r.value !== '')

    if (rows.length === 0) {
        return <p style={{fontSize: 12, color: '#5f7080', margin: 0}}>No metadata available.</p>
    }

    return (
        <div className="meta-grid">
            {rows.map((row) => (
                <div key={row.label} className="meta-row">
                    <span className="meta-label">{row.label}</span>
                    <span className="meta-value">{row.value}</span>
                </div>
            ))}
        </div>
    )
}

// ─── Tag editor (AWS only) ────────────────────────────────────────────────────

function TagEditor({
    tags,
    setTags,
    dirty,
    setDirty,
    saveMsg,
    onSave,
    isPending,
    emptyText = 'No tags. Click + to add one.',
    showSave = true,
}: {
    tags: S3Tag[]
    setTags: React.Dispatch<React.SetStateAction<S3Tag[]>>
    dirty: boolean
    setDirty: React.Dispatch<React.SetStateAction<boolean>>
    saveMsg: string | null
    onSave: () => void
    isPending: boolean
    emptyText?: string
    showSave?: boolean
}) {
    function updateTag(idx: number, field: 'key' | 'value', val: string) {
        setTags((prev) => prev.map((t, i) => (i === idx ? {...t, [field]: val} : t)))
        setDirty(true)
    }

    function removeTag(idx: number) {
        setTags((prev) => prev.filter((_, i) => i !== idx))
        setDirty(true)
    }

    function addTag() {
        setTags((prev) => [...prev, {key: '', value: ''}])
        setDirty(true)
    }

    return (
        <>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 26px', gap: '4px 6px', marginBottom: 4}}>
                <span style={{fontSize: 10, color: '#5f7080', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 2px'}}>Key</span>
                <span style={{fontSize: 10, color: '#5f7080', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 2px'}}>Value</span>
                <span/>
            </div>
            {tags.length === 0 ? (
                <p style={{fontSize: 12, color: '#5f7080', margin: '4px 0 8px'}}>{emptyText}</p>
            ) : (
                tags.map((tag, i) => (
                    <div key={i} className="tag-row">
                        <input className="tag-input" value={tag.key} placeholder="Key"
                               onChange={(e) => updateTag(i, 'key', e.target.value)}/>
                        <input className="tag-input" value={tag.value} placeholder="Value"
                               onChange={(e) => updateTag(i, 'value', e.target.value)}/>
                        <button className="icon-btn danger" onClick={() => removeTag(i)}><X size={12}/></button>
                    </div>
                ))
            )}
            <button className="button" style={{alignSelf: 'flex-start', marginTop: 4}} onClick={addTag}>
                <Plus size={13}/> Add tag
            </button>
            {showSave && (
                <div style={{marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #2d3f57', paddingTop: 10}}>
                    <button className="button primary" disabled={!dirty || isPending} onClick={onSave}>
                        {isPending ? <Loader2 size={13}/> : null}
                        Save tags
                    </button>
                    {saveMsg && (
                        <span style={{fontSize: 12, color: saveMsg.startsWith('Saved') ? '#4ade80' : '#f87171'}}>{saveMsg}</span>
                    )}
                </div>
            )}
        </>
    )
}

// ─── Object info + tags drawer (AWS only) ─────────────────────────────────────

function ObjectInfoDrawer({
    bucket,
    objectKey,
    onClose,
}: {
    bucket: string
    objectKey: string | null
    onClose: () => void
}) {
    const [tab, setTab] = useState<'info' | 'tags'>('info')
    const [tags, setTags] = useState<S3Tag[]>([])
    const [dirty, setDirty] = useState(false)
    const [saveMsg, setSaveMsg] = useState<string | null>(null)

    const metaQuery = useS3ObjectMetadataQuery(bucket, objectKey)
    const tagsQuery = useS3ObjectTagsQuery(bucket, objectKey)

    useEffect(() => {
        if (tagsQuery.data && !dirty) setTags(tagsQuery.data)
    }, [tagsQuery.data, dirty])

    const saveMutation = usePutS3ObjectTagsMutation({
        onSuccess: () => {
            setDirty(false)
            setSaveMsg('Saved ✓')
            setTimeout(() => setSaveMsg(null), 2500)
        },
        onError: (err) => setSaveMsg(err instanceof Error ? err.message : 'Error'),
    })

    const filename = objectKey?.split('/').pop() ?? objectKey ?? ''

    return (
        <div className={`tag-drawer ${objectKey ? 'open' : ''}`}>
            <div className="tag-drawer-header">
                <Info size={14} color="#8d9cad"/>
                <h3 title={objectKey ?? ''}>{filename}</h3>
                <button className="icon-btn" onClick={onClose}><X size={14}/></button>
            </div>

            <div className="drawer-tabs">
                <button className={`drawer-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>Info</button>
                <button className={`drawer-tab ${tab === 'tags' ? 'active' : ''}`} onClick={() => setTab('tags')}>Tags</button>
            </div>

            <div className="tag-drawer-body">
                {tab === 'info' ? (
                    metaQuery.isLoading ? (
                        <div style={{display: 'flex', alignItems: 'center', gap: 8, color: '#5f7080', fontSize: 13}}>
                            <Loader2 size={14}/> Loading metadata…
                        </div>
                    ) : metaQuery.isError ? (
                        <p style={{color: '#f87171', fontSize: 13}}>Failed to load metadata.</p>
                    ) : metaQuery.data ? (
                        <MetaGrid meta={metaQuery.data}/>
                    ) : null
                ) : tagsQuery.isLoading ? (
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, color: '#5f7080', fontSize: 13}}>
                        <Loader2 size={14}/> Loading tags…
                    </div>
                ) : tagsQuery.isError ? (
                    <p style={{color: '#f87171', fontSize: 13}}>Failed to load tags.</p>
                ) : (
                    <TagEditor
                        tags={tags}
                        setTags={setTags}
                        dirty={dirty}
                        setDirty={setDirty}
                        saveMsg={saveMsg}
                        onSave={() => saveMutation.mutate({bucket, key: objectKey!, tags})}
                        isPending={saveMutation.isPending}
                    />
                )}
            </div>
        </div>
    )
}

// ─── Bucket settings drawer (AWS only) ───────────────────────────────────────

function BucketSettingsDrawer({
    bucket,
    open,
    onClose,
}: {
    bucket: string
    open: boolean
    onClose: () => void
}) {
    const [tab, setTab] = useState<'versioning' | 'tags'>('versioning')
    const [tags, setTags] = useState<S3Tag[]>([])
    const [dirty, setDirty] = useState(false)
    const [saveMsg, setSaveMsg] = useState<string | null>(null)

    const versioningQuery = useBucketVersioningQuery(bucket, open)
    const bucketTagsQuery = useBucketTagsQuery(bucket, open)

    useEffect(() => {
        if (!open) {
            setTags([])
            setDirty(false)
            setSaveMsg(null)
            setTab('versioning')
        }
    }, [open])

    useEffect(() => {
        if (bucketTagsQuery.data && !dirty) setTags(bucketTagsQuery.data)
    }, [bucketTagsQuery.data, dirty])

    const versioningMutation = usePutBucketVersioningMutation({
        onSuccess: () => void versioningQuery.refetch(),
    })

    const tagsMutation = usePutBucketTagsMutation({
        onSuccess: () => {
            setDirty(false)
            setSaveMsg('Saved ✓')
            setTimeout(() => setSaveMsg(null), 2500)
        },
        onError: (err) => setSaveMsg(err instanceof Error ? err.message : 'Error'),
    })

    const versioningStatus = versioningQuery.data ?? 'Unversioned'

    return (
        <div className={`tag-drawer ${open ? 'open' : ''}`}>
            <div className="tag-drawer-header">
                <Settings size={14} color="#8d9cad"/>
                <h3 title={bucket}>Settings · {bucket}</h3>
                <button className="icon-btn" onClick={onClose}><X size={14}/></button>
            </div>

            <div className="drawer-tabs">
                <button className={`drawer-tab ${tab === 'versioning' ? 'active' : ''}`} onClick={() => setTab('versioning')}>Versioning</button>
                <button className={`drawer-tab ${tab === 'tags' ? 'active' : ''}`} onClick={() => setTab('tags')}>Tags</button>
            </div>

            <div className="tag-drawer-body">
                {tab === 'versioning' ? (
                    versioningQuery.isLoading ? (
                        <div style={{display: 'flex', alignItems: 'center', gap: 8, color: '#5f7080', fontSize: 13}}>
                            <Loader2 size={14}/> Loading…
                        </div>
                    ) : versioningQuery.isError ? (
                        <p style={{color: '#f87171', fontSize: 13}}>Failed to load versioning config.</p>
                    ) : (
                        <>
                            <div className="versioning-toggle">
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={versioningStatus === 'Enabled'}
                                        disabled={versioningMutation.isPending}
                                        onChange={(e) => versioningMutation.mutate({bucket, enabled: e.target.checked})}
                                    />
                                    <span className="toggle-track"/>
                                </label>
                                <div>
                                    <div style={{fontSize: 13, color: '#d1d1d1', fontWeight: 500}}>
                                        Versioning: <span style={{color: versioningStatus === 'Enabled' ? '#4ade80' : '#8d9cad'}}>{versioningStatus}</span>
                                    </div>
                                    <div style={{fontSize: 12, color: '#5f7080', marginTop: 3, lineHeight: 1.5}}>
                                        {versioningStatus === 'Enabled'
                                            ? 'Multiple versions of objects are preserved.'
                                            : versioningStatus === 'Suspended'
                                                ? 'Versioning is suspended. Existing versions are retained.'
                                                : 'Enable to keep all previous versions of every object.'}
                                    </div>
                                </div>
                            </div>
                            {versioningMutation.isError && (
                                <p style={{fontSize: 12, color: '#f87171', margin: 0}}>
                                    {versioningMutation.error instanceof Error ? versioningMutation.error.message : 'Update failed'}
                                </p>
                            )}
                        </>
                    )
                ) : bucketTagsQuery.isLoading ? (
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, color: '#5f7080', fontSize: 13}}>
                        <Loader2 size={14}/> Loading tags…
                    </div>
                ) : (
                    <TagEditor
                        tags={tags}
                        setTags={setTags}
                        dirty={dirty}
                        setDirty={setDirty}
                        saveMsg={saveMsg}
                        onSave={() => tagsMutation.mutate({bucket, tags})}
                        isPending={tagsMutation.isPending}
                        emptyText="No bucket tags. Click + to add one."
                    />
                )}
            </div>
        </div>
    )
}

// ─── Create resource inline bar ───────────────────────────────────────────────

interface CreateResourceInput {
    name: string
    versioningEnabled?: boolean
    tags?: S3Tag[]
}

function CreateBucketBar({
    isAws,
    resourceLabel,
    onConfirm,
    onCancel,
    isPending,
}: {
    isAws: boolean
    resourceLabel: string
    onConfirm: (input: CreateResourceInput) => void
    onCancel: () => void
    isPending: boolean
}) {
    const [name, setName] = useState('')
    const [tags, setTags] = useState<S3Tag[]>([])
    const [tagsDirty, setTagsDirty] = useState(false)
    const [versioningEnabled, setVersioningEnabled] = useState(false)
    const validTags = tags.filter((tag) => tag.key.trim() && tag.value.trim())
    const createInput: CreateResourceInput = {
        name: name.trim(),
        ...(isAws ? {tags: validTags.length ? validTags : undefined, versioningEnabled} : {}),
    }

    function submit() {
        if (name.trim().length >= 3) onConfirm(createInput)
    }

    return (
        <div className="create-bucket-bar">
            <div style={{display: 'flex', alignItems: 'center', gap: 8, width: '100%'}}>
                <Database size={13} color="#ff9900"/>
                <input
                    className="input"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase().replace(isAws ? /[^a-z0-9.-]/g : /[^a-z0-9-]/g, ''))}
                    placeholder={`my-${resourceLabel}-name`}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') submit()
                        if (e.key === 'Escape') onCancel()
                    }}
                    style={{flex: 1, minWidth: 0}}
                />
                {isAws && (
                    <label style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8d9cad'}}>
                        <input
                            type="checkbox"
                            checked={versioningEnabled}
                            onChange={(e) => setVersioningEnabled(e.target.checked)}
                        />
                        Versioning
                    </label>
                )}
                <button className="button primary" disabled={name.trim().length < 3 || isPending} onClick={submit}>
                    {isPending ? <Loader2 size={13}/> : null}
                    Create
                </button>
                <button className="button" onClick={onCancel} disabled={isPending}><X size={13}/></button>
            </div>
            {isAws && (
                <div style={{width: '100%', marginTop: 8}}>
                    <TagEditor
                        tags={tags}
                        setTags={setTags}
                        dirty={tagsDirty}
                        setDirty={setTagsDirty}
                        saveMsg={null}
                        onSave={() => undefined}
                        isPending={false}
                        emptyText={`No ${resourceLabel} tags. Click + to add one before creating.`}
                        showSave={false}
                    />
                </div>
            )}
        </div>
    )
}

// ─── Azure blob info drawer (no API call needed) ─────────────────────────────

function BlobInfoDrawer({
    object,
    onClose,
}: {
    object: StorageObject | null
    onClose: () => void
}) {
    const rows: Array<{label: string; value: string}> = object ? [
        {label: 'Key', value: object.key},
        {label: 'Size', value: object.size !== null ? formatBytes(object.size) : '—'},
        {label: 'Last Modified', value: object.lastModified ?? '—'},
        {label: 'Content-Type', value: String(object.metadata.contentType ?? '—')},
        {label: 'ETag', value: String(object.metadata.etag ?? '—')},
        {label: 'Blob Type', value: String(object.metadata.blobType ?? '—')},
        {label: 'Access Tier', value: String(object.metadata.accessTier ?? '—')},
    ].filter((r) => r.value !== '—') : []

    return (
        <div className={`tag-drawer ${object ? 'open' : ''}`}>
            <div className="tag-drawer-header">
                <Info size={14} color="#8d9cad"/>
                <h3 title={object?.key ?? ''}>{object?.name ?? ''}</h3>
                <button className="icon-btn" onClick={onClose}><X size={14}/></button>
            </div>
            <div className="drawer-tabs">
                <button className="drawer-tab active">Info</button>
            </div>
            <div className="tag-drawer-body">
                {rows.length === 0 ? (
                    <p style={{fontSize: 12, color: '#5f7080', margin: 0}}>No metadata available.</p>
                ) : (
                    <div className="meta-grid">
                        {rows.map((row) => (
                            <div key={row.label} className="meta-row">
                                <span className="meta-label">{row.label}</span>
                                <span className="meta-value">{row.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Copy object modal (cloud-agnostic) ──────────────────────────────────────

function CopyModal({
    cloud,
    resourceId,
    srcBucket,
    srcKey,
    resourceLabel,
    onClose,
    onSuccess,
}: {
    cloud: CloudProvider
    resourceId: string
    srcBucket: string
    srcKey: string
    resourceLabel: string
    onClose: () => void
    onSuccess: () => void
}) {
    const [destBucket, setDestBucket] = useState(srcBucket)
    const [destKey, setDestKey] = useState(() => {
        const parts = srcKey.split('/')
        const filename = parts.pop() ?? srcKey
        const dir = parts.join('/')
        return dir ? `${dir}/copy-of-${filename}` : `copy-of-${filename}`
    })

    const copyMutation = useMutation({
        mutationFn: () => copyStorageObject(
            cloud,
            resourceId,
            srcKey,
            destKey,
            destBucket !== srcBucket ? destBucket : undefined,
        ),
        onSuccess: () => {
            onSuccess()
            onClose()
        },
    })

    return (
        <div className="copy-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <div className="copy-modal">
                <h3>Copy object</h3>
                <div style={{fontSize: 12, color: '#8d9cad'}}>
                    Source: <span className="mono" style={{color: '#d1d1d1'}}>{srcBucket}/{srcKey}</span>
                </div>
                <div className="form-row">
                    <label>Destination {resourceLabel}</label>
                    <input className="input" value={destBucket} onChange={(e) => setDestBucket(e.target.value)}/>
                </div>
                <div className="form-row">
                    <label>Destination key</label>
                    <input className="input" value={destKey} onChange={(e) => setDestKey(e.target.value)}/>
                </div>
                {copyMutation.isError && (
                    <p style={{fontSize: 12, color: '#f87171', margin: 0}}>
                        {copyMutation.error instanceof Error ? copyMutation.error.message : 'Copy failed'}
                    </p>
                )}
                <div className="copy-modal-footer">
                    <button className="button" onClick={onClose} disabled={copyMutation.isPending}>Cancel</button>
                    <button
                        className="button primary"
                        disabled={!destBucket.trim() || !destKey.trim() || copyMutation.isPending}
                        onClick={() => copyMutation.mutate()}
                    >
                        {copyMutation.isPending ? <Loader2 size={13}/> : <Copy size={13}/>}
                        Copy
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Upload status overlay ────────────────────────────────────────────────────

type UploadStatus = 'pending' | 'done' | 'error'

function UploadStatusBar({uploads}: { uploads: Map<string, UploadStatus> }) {
    if (uploads.size === 0) return null
    return (
        <div>
            {Array.from(uploads.entries()).map(([name, status]) => (
                <div key={name} className={`upload-item ${status}`}>
                    {status === 'pending' && <Loader2 size={12}/>}
                    {status === 'done' && '✓'}
                    {status === 'error' && '✗'}
                    <span className="mono">{name}</span>
                    <span style={{marginLeft: 'auto', color: 'inherit', opacity: 0.7}}>
                        {status === 'pending' ? 'Uploading…' : status === 'done' ? 'Done' : 'Failed'}
                    </span>
                </div>
            ))}
        </div>
    )
}

// ─── New folder bar ───────────────────────────────────────────────────────────

function NewFolderBar({
    prefix,
    onConfirm,
    onCancel,
}: {
    prefix: string
    onConfirm: (name: string) => void
    onCancel: () => void
}) {
    const [name, setName] = useState('')
    return (
        <div className="new-folder-bar">
            <FolderPlus size={13} color="#539fe5"/>
            <span style={{fontSize: 12, color: '#8d9cad'}}>{prefix || '/'}</span>
            <input
                className="input"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="folder-name"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && name.trim()) onConfirm(name.trim())
                    if (e.key === 'Escape') onCancel()
                }}
                style={{minWidth: 180, width: 180}}
            />
            <button className="button primary" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>
                Create
            </button>
            <button className="button" onClick={onCancel}><X size={13}/></button>
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function S3Page() {
    const qc = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [searchParams] = useSearchParams()
    const cloud = (searchParams.get('cloud') ?? 'aws') as CloudProvider
    const isAws = cloud === 'aws'
    const resourceLabel = cloud === 'azure' ? 'container' : 'bucket'
    const objectLabel = cloud === 'azure' ? 'blob' : 'object'

    const [selectedResource, setSelectedResource] = useState<CloudResource | null>(null)
    const [prefix, setPrefix] = useState('')
    const [fileSearch, setFileSearch] = useState('')
    const [infoKey, setInfoKey] = useState<string | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [uploads, setUploads] = useState<Map<string, UploadStatus>>(new Map())
    const [deleting, setDeleting] = useState<Set<string>>(new Set())
    const [newFolderMode, setNewFolderMode] = useState(false)
    const [createBucketMode, setCreateBucketMode] = useState(false)
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [copyKey, setCopyKey] = useState<string | null>(null)

    // Derived from selectedResource
    const selectedBucket = selectedResource?.name ?? null
    const selectedBucketId = selectedResource?.id ?? null

    // Reset when cloud changes
    useEffect(() => {
        goToRoot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cloud])

    // ── Queries ──
    const bucketsQuery = useQuery({
        queryKey: ['cloud-resources', cloud, 'storage'],
        queryFn: ({signal}) => listCloudResources(cloud, 'storage', undefined, signal),
    })

    const objectsQuery = useQuery({
        queryKey: ['storage-objects', cloud, selectedBucketId, prefix],
        queryFn: ({signal}) => listStorageObjects(cloud, selectedBucketId!, prefix || undefined, signal),
        enabled: !!selectedBucketId,
    })

    // ── Mutations ──
    const createBucketMutation = useMutation({
        mutationFn: (input: CreateResourceInput) => {
            const nameField = cloud === 'azure' ? 'containerName' : 'bucketName'
            return createCloudResource(cloud, 'storage', {
                [nameField]: input.name,
                ...(isAws ? {versioningEnabled: input.versioningEnabled, tags: input.tags} : {}),
            })
        },
        onSuccess: (resource) => {
            setCreateBucketMode(false)
            selectResource(resource)
            void qc.invalidateQueries({queryKey: ['cloud-resources', cloud, 'storage']})
        },
        onError: (err) => alert(`Create ${resourceLabel} failed: ${err instanceof Error ? err.message : err}`),
    })

    const deleteBucketMutation = useMutation({
        mutationFn: (resource: CloudResource) => deleteCloudResource(cloud, 'storage', resource.id),
        onSuccess: (_, resource) => {
            if (selectedResource?.id === resource.id) goToRoot()
            void qc.invalidateQueries({queryKey: ['cloud-resources', cloud, 'storage']})
        },
        onError: (err) => alert(`Delete ${resourceLabel} failed: ${err instanceof Error ? err.message : err}`),
    })

    // ── Navigation helpers ──
    function selectResource(resource: CloudResource) {
        setSelectedResource(resource)
        setPrefix('')
        setFileSearch('')
        setInfoKey(null)
        setSettingsOpen(false)
        setNewFolderMode(false)
        setSelectedKeys(new Set())
    }

    function navigateToFolder(folderPrefix: string) {
        setPrefix(folderPrefix)
        setFileSearch('')
        setInfoKey(null)
        setNewFolderMode(false)
        setSelectedKeys(new Set())
    }

    function goToRoot() {
        setSelectedResource(null)
        setPrefix('')
        setFileSearch('')
        setInfoKey(null)
        setSettingsOpen(false)
        setNewFolderMode(false)
        setSelectedKeys(new Set())
        setCreateBucketMode(false)
    }

    // ── Upload ──
    async function handleFiles(fileList: FileList | null) {
        if (!fileList || !selectedBucketId) return
        const files = Array.from(fileList)
        setUploads((prev) => {
            const next = new Map(prev)
            files.forEach((f) => next.set(f.name, 'pending'))
            return next
        })
        await Promise.all(
            files.map(async (file) => {
                try {
                    await uploadStorageObject(cloud, selectedBucketId!, prefix + file.name, file)
                    setUploads((prev) => new Map(prev).set(file.name, 'done'))
                } catch {
                    setUploads((prev) => new Map(prev).set(file.name, 'error'))
                }
            }),
        )
        void qc.invalidateQueries({queryKey: ['storage-objects', cloud, selectedBucketId]})
        setTimeout(() => setUploads(new Map()), 3500)
    }

    // ── Delete single object ──
    async function handleDelete(key: string) {
        if (!selectedBucketId) return
        if (!window.confirm(`Delete "${basename(key, prefix)}"?`)) return
        setDeleting((prev) => new Set(prev).add(key))
        try {
            await deleteStorageObject(cloud, selectedBucketId, key)
            void qc.invalidateQueries({queryKey: ['storage-objects', cloud, selectedBucketId]})
        } catch (err) {
            alert(`Delete failed: ${err instanceof Error ? err.message : err}`)
        } finally {
            setDeleting((prev) => {
                const s = new Set(prev)
                s.delete(key)
                return s
            })
        }
    }

    // ── Bulk delete ──
    async function handleBulkDelete() {
        if (!selectedBucketId || selectedKeys.size === 0) return
        if (!window.confirm(`Delete ${selectedKeys.size} ${objectLabel}${selectedKeys.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
        setBulkDeleting(true)
        try {
            await Promise.all([...selectedKeys].map((key) => deleteStorageObject(cloud, selectedBucketId!, key)))
            setSelectedKeys(new Set())
            void qc.invalidateQueries({queryKey: ['storage-objects', cloud, selectedBucketId]})
        } catch (err) {
            alert(`Bulk delete failed: ${err instanceof Error ? err.message : err}`)
        } finally {
            setBulkDeleting(false)
        }
    }

    // ── Delete resource ──
    function handleDeleteBucket(resource: CloudResource) {
        if (!window.confirm(`Delete ${resourceLabel} "${resource.name}"?\n\nThe ${resourceLabel} must be empty. This cannot be undone.`)) return
        deleteBucketMutation.mutate(resource)
    }

    // ── New folder ──
    async function handleNewFolder(name: string) {
        if (!selectedBucketId) return
        const key = prefix + name.replace(/\/$/, '') + '/'
        try {
            await uploadStorageObject(cloud, selectedBucketId, key, new Blob(['']))
            setNewFolderMode(false)
            void qc.invalidateQueries({queryKey: ['storage-objects', cloud, selectedBucketId]})
        } catch (err) {
            alert(`Could not create folder: ${err instanceof Error ? err.message : err}`)
        }
    }

    // ── Open info drawer (closes settings) — AWS only ──
    function openInfo(key: string) {
        setSettingsOpen(false)
        setInfoKey(key)
    }

    // ── Open settings drawer (closes info) — AWS only ──
    function openSettings() {
        setInfoKey(null)
        setSettingsOpen((v) => !v)
    }

    // ── Filtered data ──
    const storageData = objectsQuery.data
    const folders = storageData?.objects.filter((o) => o.type === 'folder').map((o) => o.key) ?? []
    const files: StorageObject[] = storageData?.objects.filter((o) => o.type === 'object') ?? []
    const q = fileSearch.toLowerCase()
    const filteredFolders = q ? folders.filter((f) => f.slice(prefix.length).toLowerCase().includes(q)) : folders
    const filteredFiles = q ? files.filter((f) => f.key.toLowerCase().includes(q)) : files
    const totalItems = filteredFolders.length + filteredFiles.length

    const allSelected = filteredFiles.length > 0 && filteredFiles.every((f) => selectedKeys.has(f.key))
    const someSelected = !allSelected && filteredFiles.some((f) => selectedKeys.has(f.key))

    const summaryParts = []
    if (folders.length) summaryParts.push(`${folders.length} folder${folders.length !== 1 ? 's' : ''}`)
    if (files.length) summaryParts.push(`${files.length} ${objectLabel}${files.length !== 1 ? 's' : ''}`)

    const pageTitle = cloud === 'azure' ? 'Blob Storage' : 'S3'
    const pageSubtitle = cloud === 'azure' ? 'Azure Blob Storage' : 'Simple Storage Service'
    const resourcesLabel = `${resourceLabel.charAt(0).toUpperCase()}${resourceLabel.slice(1)}s`

    return (
        <>
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{display: 'none'}}
                onChange={(e) => void handleFiles(e.target.files)}
                onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
            />

            {/* Object info + tags drawer — AWS only */}
            {isAws && selectedBucket && (
                <ObjectInfoDrawer
                    key={infoKey}
                    bucket={selectedBucket}
                    objectKey={infoKey}
                    onClose={() => setInfoKey(null)}
                />
            )}

            {/* Blob info drawer — non-AWS */}
            {!isAws && (
                <BlobInfoDrawer
                    object={infoKey ? (files.find((f) => f.key === infoKey) ?? null) : null}
                    onClose={() => setInfoKey(null)}
                />
            )}

            {/* Bucket settings drawer — AWS only */}
            {isAws && selectedBucket && (
                <BucketSettingsDrawer
                    key={selectedBucket}
                    bucket={selectedBucket}
                    open={settingsOpen}
                    onClose={() => setSettingsOpen(false)}
                />
            )}

            {/* Copy object modal — all clouds */}
            {selectedBucket && selectedBucketId && copyKey && (
                <CopyModal
                    key={copyKey}
                    cloud={cloud}
                    resourceId={selectedBucketId}
                    srcBucket={selectedBucket}
                    srcKey={copyKey}
                    resourceLabel={resourceLabel}
                    onClose={() => setCopyKey(null)}
                    onSuccess={() => void qc.invalidateQueries({queryKey: ['storage-objects', cloud, selectedBucketId]})}
                />
            )}

            <div className="page-header">
                <div className="page-title">
                    <h2>{pageTitle}</h2>
                    <span className="info-link">
                        <Info size={11}/>
                        {pageSubtitle}
                    </span>
                </div>
                <div style={{display: 'flex', gap: 8}}>
                    {selectedBucket && (
                        <>
                            <button className="button primary" onClick={() => fileInputRef.current?.click()}>
                                <Upload size={13}/>
                                Upload
                            </button>
                            <button className="button" onClick={() => setNewFolderMode((v) => !v)}>
                                <FolderPlus size={13}/>
                                New folder
                            </button>
                            {isAws && (
                                <button className={`button ${settingsOpen ? 'primary' : ''}`} onClick={openSettings}>
                                    <Settings size={13}/>
                                    Settings
                                </button>
                            )}
                        </>
                    )}
                    <button
                        className="button"
                        onClick={() => void (selectedBucketId ? objectsQuery.refetch() : bucketsQuery.refetch())}
                    >
                        <RefreshCw size={13}/>
                        Refresh
                    </button>
                </div>
            </div>

            <div className="split">
                {/* ── Left: resource list ── */}
                <aside className="list-pane">
                    <div className="widget-header">
                        <Database size={13} color="#8d9cad"/>
                        <h3>{resourcesLabel} ({bucketsQuery.data?.length ?? 0})</h3>
                        <button
                            className="icon-btn"
                            style={{marginLeft: 'auto'}}
                            title={`Create ${resourceLabel}`}
                            onClick={() => setCreateBucketMode((v) => !v)}
                        >
                            <Plus size={13}/>
                        </button>
                    </div>

                    {createBucketMode && (
                        <CreateBucketBar
                            isAws={isAws}
                            resourceLabel={resourceLabel}
                            onConfirm={(input) => createBucketMutation.mutate(input)}
                            onCancel={() => setCreateBucketMode(false)}
                            isPending={createBucketMutation.isPending}
                        />
                    )}

                    {bucketsQuery.isLoading ? (
                        <div className="empty"><p>Loading {resourceLabel}s…</p></div>
                    ) : bucketsQuery.isError ? (
                        <EmptyState icon={Database} title={`Cannot load ${resourceLabel}s`}
                                    description={`Storage did not respond from the Floci endpoint.`}/>
                    ) : (bucketsQuery.data ?? []).length === 0 ? (
                        <EmptyState icon={Database} title={`No ${resourceLabel}s`}
                                    description={`Click + above or use the ${cloud === 'azure' ? 'Azure CLI' : 'AWS CLI'} to create a ${resourceLabel}.`}/>
                    ) : (
                        (bucketsQuery.data ?? []).map((bucket) => (
                            <div
                                key={bucket.id}
                                className={`list-item ${selectedResource?.id === bucket.id ? 'active' : ''}`}
                                style={{cursor: 'pointer', display: 'flex', alignItems: 'center'}}
                                onClick={() => selectResource(bucket)}
                            >
                                <div style={{flex: 1, minWidth: 0}}>
                                    <strong>{bucket.name}</strong>
                                    <span>Created {timeAgo(bucket.createdAt ?? undefined)}</span>
                                </div>
                                <div style={{display: 'flex', gap: 2, flexShrink: 0}}>
                                    {isAws && (
                                        <button
                                            className="icon-btn bucket-action-btn"
                                            title="Bucket settings"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                selectResource(bucket)
                                                setTimeout(() => { setInfoKey(null); setSettingsOpen(true) }, 0)
                                            }}
                                        >
                                            <Settings size={12}/>
                                        </button>
                                    )}
                                    <button
                                        className="icon-btn danger bucket-action-btn"
                                        title={`Delete ${resourceLabel}`}
                                        onClick={(e) => { e.stopPropagation(); handleDeleteBucket(bucket) }}
                                    >
                                        <Trash2 size={12}/>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </aside>

                {/* ── Right: object browser ── */}
                <section className="detail-pane" style={{display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                    {!selectedBucket ? (
                        <div className="empty" style={{minHeight: 400}}>
                            <div className="empty-icon"><Database size={24}/></div>
                            <h3>Select a {resourceLabel}</h3>
                            <p>Choose a {resourceLabel} from the list, or click + to create one.</p>
                        </div>
                    ) : (
                        <div style={{display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'}}>

                            {/* Breadcrumb */}
                            <Breadcrumb
                                bucket={selectedBucket}
                                prefix={prefix}
                                onRoot={goToRoot}
                                onNavigate={navigateToFolder}
                            />

                            {/* New folder bar */}
                            {newFolderMode && (
                                <NewFolderBar
                                    prefix={prefix}
                                    onConfirm={handleNewFolder}
                                    onCancel={() => setNewFolderMode(false)}
                                />
                            )}

                            {/* Upload status */}
                            <UploadStatusBar uploads={uploads}/>

                            {/* Search + summary */}
                            <div className="input-row">
                                <Search size={14} color="#8d9cad"/>
                                <input
                                    className="input"
                                    value={fileSearch}
                                    onChange={(e) => setFileSearch(e.target.value)}
                                    placeholder={`Search files and folders…`}
                                />
                                {(folders.length > 0 || files.length > 0) && (
                                    <span style={{color: '#5f7080', fontSize: 11, whiteSpace: 'nowrap'}}>
                                        {summaryParts.join(', ')}
                                    </span>
                                )}
                            </div>

                            {/* Table */}
                            <div style={{flex: 1, overflowY: 'auto'}}>
                                {objectsQuery.isLoading ? (
                                    <div className="empty"><p>Loading {objectLabel}s…</p></div>
                                ) : objectsQuery.isError ? (
                                    <EmptyState icon={File} title={`Cannot load ${objectLabel}s`}
                                                description={`Failed to list ${objectLabel}s in this ${resourceLabel}.`}/>
                                ) : totalItems === 0 && !fileSearch ? (
                                    <EmptyState
                                        icon={Folder}
                                        title={prefix ? 'Empty folder' : `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)} is empty`}
                                        description={
                                            prefix
                                                ? 'No files here yet. Click Upload to add some.'
                                                : `This ${resourceLabel} has no ${objectLabel}s. Click Upload to add files.`
                                        }
                                    />
                                ) : totalItems === 0 ? (
                                    <EmptyState icon={Search} title="No results"
                                                description={`Nothing matches "${fileSearch}".`}/>
                                ) : (
                                    <table className="table">
                                        <thead>
                                        <tr>
                                            <th style={{width: 36, textAlign: 'center'}}>
                                                <input
                                                    type="checkbox"
                                                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                                                    checked={allSelected}
                                                    onChange={() => {
                                                        if (allSelected) setSelectedKeys(new Set())
                                                        else setSelectedKeys(new Set(filteredFiles.map((f) => f.key)))
                                                    }}
                                                />
                                            </th>
                                            <th>Name</th>
                                            <th style={{width: 80}}>Type</th>
                                            <th style={{width: 90}}>Size</th>
                                            <th style={{width: 120}}>Last modified</th>
                                            <th style={{width: 108}}>Actions</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {/* Folders */}
                                        {filteredFolders.map((folder) => {
                                            const name = folder.slice(prefix.length).replace(/\/$/, '') || folder
                                            return (
                                                <tr key={folder} style={{cursor: 'pointer'}} onClick={() => navigateToFolder(folder)}>
                                                    <td/>
                                                    <td>
                                                        <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                                            <Folder size={14} color="#f59e0b" style={{flexShrink: 0}}/>
                                                            <span style={{color: '#539fe5'}}>{name}/</span>
                                                        </span>
                                                    </td>
                                                    <td style={{color: '#5f7080'}}>Folder</td>
                                                    <td style={{color: '#5f7080'}}>—</td>
                                                    <td style={{color: '#5f7080'}}>—</td>
                                                    <td/>
                                                </tr>
                                            )
                                        })}

                                        {/* Files */}
                                        {filteredFiles.map((obj) => {
                                            const name = basename(obj.key, prefix)
                                            const isDeleting = deleting.has(obj.key)
                                            const isSelected = selectedKeys.has(obj.key)
                                            return (
                                                <tr
                                                    key={obj.key}
                                                    style={{
                                                        opacity: isDeleting ? 0.4 : 1,
                                                        background: isSelected ? 'rgba(83,159,229,0.07)' : undefined,
                                                    }}
                                                >
                                                    <td style={{textAlign: 'center'}}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                const next = new Set(selectedKeys)
                                                                if (e.target.checked) next.add(obj.key)
                                                                else next.delete(obj.key)
                                                                setSelectedKeys(next)
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </td>
                                                    <td>
                                                        <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                                            {fileIcon(obj.key)}
                                                            <span className="mono" style={{fontSize: 12}}>{name}</span>
                                                        </span>
                                                    </td>
                                                    <td style={{color: '#5f7080'}}>{objectLabel.charAt(0).toUpperCase() + objectLabel.slice(1)}</td>
                                                    <td>{obj.size !== null ? formatBytes(obj.size) : '—'}</td>
                                                    <td style={{color: '#8d9cad'}}>
                                                        {obj.lastModified ? timeAgo(obj.lastModified) : '—'}
                                                    </td>
                                                    <td>
                                                        <span style={{display: 'flex', gap: 3}}>
                                                            {/* Info / tags */}
                                                            <button
                                                                className="icon-btn"
                                                                title={isAws ? 'Info & tags' : 'Blob info'}
                                                                onClick={(e) => { e.stopPropagation(); openInfo(obj.key) }}
                                                            >
                                                                <Tag size={12}/>
                                                            </button>
                                                            {/* Download */}
                                                            <a
                                                                className="icon-btn"
                                                                href={storageObjectDownloadUrl(cloud, selectedBucketId!, obj.key)}
                                                                download={name}
                                                                title="Download"
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 13}}
                                                            >
                                                                ⬇
                                                            </a>
                                                            {/* Copy */}
                                                            <button
                                                                className="icon-btn"
                                                                title={`Copy ${objectLabel}`}
                                                                onClick={(e) => { e.stopPropagation(); setCopyKey(obj.key) }}
                                                            >
                                                                <Copy size={12}/>
                                                            </button>
                                                            {/* Delete */}
                                                            <button
                                                                className="icon-btn danger"
                                                                title="Delete"
                                                                disabled={isDeleting}
                                                                onClick={(e) => { e.stopPropagation(); void handleDelete(obj.key) }}
                                                            >
                                                                {isDeleting ? <Loader2 size={12}/> : <Trash2 size={12}/>}
                                                            </button>
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Bulk action bar */}
                            {selectedKeys.size > 0 && (
                                <div className="bulk-bar">
                                    <span className="bulk-count">
                                        {selectedKeys.size} {objectLabel}{selectedKeys.size !== 1 ? 's' : ''} selected
                                    </span>
                                    <span className="bulk-spacer"/>
                                    <button
                                        className="button"
                                        style={{background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: 'white'}}
                                        onClick={() => setSelectedKeys(new Set())}
                                    >
                                        Deselect all
                                    </button>
                                    <button
                                        className="button danger"
                                        disabled={bulkDeleting}
                                        onClick={() => void handleBulkDelete()}
                                    >
                                        {bulkDeleting ? <Loader2 size={13}/> : <Trash2 size={13}/>}
                                        Delete {selectedKeys.size}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </>
    )
}
