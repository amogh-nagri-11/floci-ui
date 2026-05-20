import {useEffect, useRef, useState} from 'react'
import {ChevronLeft, ChevronRight, Download, File, Folder, RefreshCw, Trash2, Upload} from 'lucide-react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {deleteStorageObject, listStorageObjects, storageObjectDownloadUrl, uploadStorageObject} from '@/api/cloudProxyClient'
import type {CloudProvider} from '@/types/cloud'
import type {CloudResource, StorageObject} from '@/types/resource'

interface StorageObjectBrowserProps {
    cloud: CloudProvider
    resource?: CloudResource
    capabilities?: Array<'list' | 'upload' | 'download' | 'delete' | 'createFolder'>
    selectedObjectKey?: string
    onSelectObject: (object?: StorageObject) => void
}

export function StorageObjectBrowser({cloud, resource, capabilities = [], selectedObjectKey, onSelectObject}: StorageObjectBrowserProps) {
    const qc = useQueryClient()
    const fileRef = useRef<HTMLInputElement | null>(null)
    const [prefix, setPrefix] = useState('')
    const [uploadPrefix, setUploadPrefix] = useState('')
    const [folderName, setFolderName] = useState('')
    const [createFolderOpen, setCreateFolderOpen] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
    const canUpload = capabilities.includes('upload')
    const canDownload = capabilities.includes('download')
    const canDelete = capabilities.includes('delete')
    const canCreateFolder = capabilities.includes('createFolder')

    useEffect(() => {
        setPrefix('')
        setUploadPrefix('')
        setFolderName('')
        setCreateFolderOpen(false)
        setDeleteConfirm(null)
        onSelectObject(undefined)
    }, [resource?.id, onSelectObject])

    const query = useQuery({
        queryKey: ['storage-objects', cloud, resource?.id, prefix],
        queryFn: ({signal}) => listStorageObjects(cloud, resource?.id ?? '', prefix, signal),
        enabled: !!resource,
    })

    const uploadMut = useMutation({
        mutationFn: async (file: File) => {
            if (!resource) return
            const key = `${uploadPrefix || prefix}${file.name}`
            await uploadStorageObject(cloud, resource.id, key, file)
        },
        onSuccess: () => qc.invalidateQueries({queryKey: ['storage-objects', cloud, resource?.id]}),
    })

    const createFolderMut = useMutation({
        mutationFn: async (name: string) => {
            if (!resource) return
            const folderKey = `${prefix}${normalizeFolderName(name)}`
            await uploadStorageObject(cloud, resource.id, folderKey, new Blob([], {type: 'application/x-directory'}))
        },
        onSuccess: () => {
            setFolderName('')
            setCreateFolderOpen(false)
            void qc.invalidateQueries({queryKey: ['storage-objects', cloud, resource?.id]})
        },
    })

    const deleteMut = useMutation({
        mutationFn: async (object: StorageObject) => {
            if (!resource) return
            await deleteStorageObject(cloud, resource.id, object.key)
        },
        onSuccess: () => qc.invalidateQueries({queryKey: ['storage-objects', cloud, resource?.id]}),
    })

    if (!resource) {
        return (
            <section className="object-browser empty compact">
                <h3>Select a storage resource</h3>
                <p>Choose a bucket or container to browse objects and blobs.</p>
            </section>
        )
    }

    const objects = query.data?.objects ?? []
    const error = query.error ?? uploadMut.error ?? createFolderMut.error ?? deleteMut.error
    const folders = objects.filter((object) => object.type === 'folder').length
    const files = objects.length - folders
    const objectLabel = cloud === 'azure' ? 'blobs' : 'objects'

    return (
        <section className="object-browser">
            <div className="object-browser-header">
                <div>
                    <p className="eyebrow">Objects</p>
                    <h3>{resource.name}</h3>
                    <div className="object-browser-subtitle">
                        <ObjectBreadcrumb prefix={prefix} onNavigate={(nextPrefix) => {
                            setPrefix(nextPrefix)
                            onSelectObject(undefined)
                        }}/>
                        <span>{folders} folders, {files} {objectLabel}</span>
                    </div>
                </div>
                <div className="object-browser-actions">
                    {prefix && (
                        <button className="button" type="button" onClick={() => {
                            setPrefix(parentPrefix(prefix))
                            onSelectObject(undefined)
                        }}>
                            <ChevronLeft size={14}/>
                            Back
                        </button>
                    )}
                    {canCreateFolder && (
                        <button className="button" type="button" onClick={() => setCreateFolderOpen((open) => !open)}>
                            <Folder size={14}/>
                            New folder
                        </button>
                    )}
                    {canUpload && (
                        <>
                            <input className="input object-prefix-input" value={uploadPrefix} onChange={(event) => setUploadPrefix(normalizePrefix(event.target.value))} placeholder={prefix ? `Upload to ${prefix}` : 'Upload prefix'}/>
                            <input ref={fileRef} type="file" hidden onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) uploadMut.mutate(file)
                                event.currentTarget.value = ''
                            }}/>
                            <button className="button" type="button" onClick={() => fileRef.current?.click()}>
                                <Upload size={14}/>
                                {uploadMut.isPending ? 'Uploading' : 'Upload'}
                            </button>
                        </>
                    )}
                    <button className="button" type="button" disabled={query.isFetching} onClick={() => query.refetch()}>
                        <RefreshCw size={14}/>
                        {query.isFetching ? 'Loading' : 'Refresh'}
                    </button>
                </div>
            </div>

            {createFolderOpen && (
                <form className="object-create-folder" onSubmit={(event) => {
                    event.preventDefault()
                    if (folderName.trim()) createFolderMut.mutate(folderName)
                }}>
                    <label>
                        <span>Folder name</span>
                        <input className="input" value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder={prefix ? `${prefix}new-folder/` : 'new-folder/'}/>
                    </label>
                    <button className="button primary" type="submit" disabled={createFolderMut.isPending || !folderName.trim()}>
                        <Folder size={14}/>
                        {createFolderMut.isPending ? 'Creating' : 'Create folder'}
                    </button>
                </form>
            )}

            {error && (
                <div className="inline-error">
                    {error instanceof Error ? error.message : 'Storage operation failed'}
                </div>
            )}

            {query.isLoading ? (
                <div className="empty compact">
                    <h3>Loading objects</h3>
                    <p>Reading objects from the selected storage resource.</p>
                </div>
            ) : objects.length === 0 ? (
                <div className="empty compact">
                    <h3>No {objectLabel}</h3>
                    <p>{prefix ? `The ${prefix} prefix is empty.` : `This ${resource.type} has no ${objectLabel} yet.`}</p>
                </div>
            ) : (
                <table className="table object-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Size</th>
                            <th>Last Modified</th>
                            <th aria-label="Actions"/>
                        </tr>
                    </thead>
                    <tbody>
                        {objects.map((object) => (
                            <tr key={object.key} className={selectedObjectKey === object.key ? 'selected' : ''}>
                                <td onClick={() => {
                                    if (object.type === 'folder') {
                                        setPrefix(object.key)
                                        onSelectObject(undefined)
                                    } else {
                                        onSelectObject(object)
                                    }
                                }}>
                                    <span className="object-name">
                                        {object.type === 'folder' ? <Folder size={14}/> : <File size={14}/>}
                                            {object.name}
                                            {object.type === 'folder' && <ChevronRight size={12}/>}
                                        </span>
                                </td>
                                <td>{object.type}</td>
                                <td>{object.size === null ? '-' : formatBytes(object.size)}</td>
                                <td>{object.lastModified ?? '-'}</td>
                                <td className="table-actions">
                                    {object.type === 'object' && (
                                        <>
                                            {canDownload && (
                                                <a className="icon-btn" href={storageObjectDownloadUrl(cloud, resource.id, object.key)} title={`Download ${object.name}`}>
                                                    <Download size={13}/>
                                                </a>
                                            )}
                                            {canDelete && deleteConfirm === object.key ? (
                                                <button className="button danger compact" disabled={deleteMut.isPending} onClick={() => {
                                                    deleteMut.mutate(object)
                                                    setDeleteConfirm(null)
                                                    onSelectObject(undefined)
                                                }}>
                                                    Confirm
                                                </button>
                                            ) : (
                                                canDelete && <button className="icon-btn danger" title={`Delete ${object.name}`} onClick={() => setDeleteConfirm(object.key)}>
                                                    <Trash2 size={13}/>
                                                </button>
                                            )}
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    )
}

function ObjectBreadcrumb({prefix, onNavigate}: {prefix: string; onNavigate: (prefix: string) => void}) {
    const segments = prefix ? prefix.replace(/\/$/, '').split('/') : []
    return (
        <div className="object-breadcrumb">
            <button type="button" onClick={() => onNavigate('')}>Root</button>
            {segments.map((segment, index) => {
                const path = `${segments.slice(0, index + 1).join('/')}/`
                return (
                    <span key={path}>
                        <ChevronRight size={11}/>
                        <button type="button" onClick={() => onNavigate(path)}>{segment}</button>
                    </span>
                )
            })}
        </div>
    )
}

function normalizePrefix(value: string): string {
    const trimmed = value.trim().replace(/^\/+/, '')
    return trimmed && !trimmed.endsWith('/') ? `${trimmed}/` : trimmed
}

function normalizeFolderName(value: string): string {
    const normalized = value.trim().replace(/^\/+/, '')
    return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function parentPrefix(prefix: string): string {
    const segments = prefix.replace(/\/$/, '').split('/').filter(Boolean)
    segments.pop()
    return segments.length ? `${segments.join('/')}/` : ''
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
