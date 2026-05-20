import type {CloudResource, StorageObject} from '@/types/resource'

interface ResourceInspectorProps {
    resource?: CloudResource
    object?: StorageObject
}

export function ResourceInspector({resource, object}: ResourceInspectorProps) {
    if (!resource) {
        return (
            <div className="resource-inspector empty compact">
                <p className="eyebrow">Resource Inspector</p>
                <h3>Select a resource</h3>
                <p>Inspect normalized metadata returned by the cloud proxy.</p>
            </div>
        )
    }

    if (object) {
        return (
            <aside className="resource-inspector">
                <div className="widget-header">
                    <h3>{object.name}</h3>
                    <span className="badge neutral">{object.type}</span>
                </div>
                <div className="inspector-grid">
                    <InspectorItem label="Cloud" value={resource.cloud}/>
                    <InspectorItem label="Resource" value={resource.name}/>
                    <InspectorItem label="Key" value={object.key}/>
                    <InspectorItem label="Size" value={object.size === null ? '-' : formatBytes(object.size)}/>
                    <InspectorItem label="Last Modified" value={object.lastModified ?? '-'}/>
                </div>
                <MetadataPanel metadata={object.metadata}/>
            </aside>
        )
    }

    return (
        <aside className="resource-inspector">
            <div className="widget-header">
                <h3>{resource.name}</h3>
                <span className="badge neutral">{resource.type}</span>
            </div>
            <div className="inspector-grid">
                <InspectorItem label="Cloud" value={resource.cloud}/>
                <InspectorItem label="Service" value={resource.service}/>
                <InspectorItem label="Region" value={resource.region ?? '-'}/>
                <InspectorItem label="Created At" value={resource.createdAt ?? '-'}/>
            </div>
            <MetadataPanel metadata={resource.metadata}/>
        </aside>
    )
}

function InspectorItem({label, value}: {label: string; value: string}) {
    return (
        <div>
            <p className="metric-label">{label}</p>
            <p className="metric-value mono">{value}</p>
        </div>
    )
}

function MetadataPanel({metadata}: {metadata: Record<string, unknown>}) {
    const rows = Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== '')

    if (rows.length === 0) {
        return (
            <div className="metadata-block empty-metadata">
                <span>No metadata returned</span>
            </div>
        )
    }

    return (
        <div className="metadata-block metadata-table">
            {rows.map(([key, value]) => (
                <div key={key}>
                    <span>{humanizeKey(key)}</span>
                    <code>{String(value)}</code>
                </div>
            ))}
        </div>
    )
}

function humanizeKey(value: string): string {
    return value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
