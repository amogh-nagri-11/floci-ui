import {useRef, useState} from 'react'
import {ChevronRight, Download, File, Folder, RefreshCw, Trash2, Upload} from 'lucide-react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {deleteStorageObject, listStorageObjects, storageObjectDownloadUrl, uploadStorageObject} from '@/api/cloudProxyClient'
import type {CloudProvider} from '@/types/cloud'
import type {CloudResource, StorageObject} from '@/types/resource'

interface StorageObjectBrowserProps {
    cloud: CloudProvider
    resource?: CloudResource
}

export function StorageObjectBrowser({cloud, resource}: StorageObjectBrowserProps) {
    const qc = useQueryClient()
    const fileRef = useRef<HTMLInputElement | null>(null)
    const [prefix, setPrefix] = useState('')
    const [uploadPrefix, setUploadPrefix] = useState('')

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

    return (
        <section className="object-browser">
            <div className="object-browser-header">
                <div>
                    <p className="eyebrow">Objects</p>
                    <h3>{resource.name}</h3>
                    <ObjectBreadcrumb prefix={prefix} onNavigate={setPrefix}/>
                </div>
                <div className="object-browser-actions">
                    <input className="input object-prefix-input" value={uploadPrefix} onChange={(event) => setUploadPrefix(event.target.value)} placeholder="Upload prefix"/>
                    <input ref={fileRef} type="file" hidden onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) uploadMut.mutate(file)
                        event.currentTarget.value = ''
                    }}/>
                    <button className="button" type="button" onClick={() => fileRef.current?.click()}>
                        <Upload size={14}/>
                        Upload
                    </button>
                    <button className="button" type="button" onClick={() => query.refetch()}>
                        <RefreshCw size={14}/>
                        Refresh
                    </button>
                </div>
            </div>

            {objects.length === 0 ? (
                <div className="empty compact">
                    <h3>No objects</h3>
                    <p>This prefix did not return objects or blobs.</p>
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
                            <tr key={object.key}>
                                <td onClick={() => object.type === 'folder' && setPrefix(object.key)}>
                                    <span className="object-name">
                                        {object.type === 'folder' ? <Folder size={14}/> : <File size={14}/>}
                                        {object.name}
                                    </span>
                                </td>
                                <td>{object.type}</td>
                                <td>{object.size === null ? '-' : formatBytes(object.size)}</td>
                                <td>{object.lastModified ?? '-'}</td>
                                <td className="table-actions">
                                    {object.type === 'object' && (
                                        <>
                                            <a className="icon-btn" href={storageObjectDownloadUrl(cloud, resource.id, object.key)} title={`Download ${object.name}`}>
                                                <Download size={13}/>
                                            </a>
                                            <button className="icon-btn danger" title={`Delete ${object.name}`} onClick={() => deleteMut.mutate(object)}>
                                                <Trash2 size={13}/>
                                            </button>
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

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
