import {type ElementType, useEffect, useMemo, useState} from 'react'
import {ChevronDown, ChevronUp, Eye, Filter, Plus, RefreshCw, Table2, Workflow} from 'lucide-react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
    createCloudResource,
    deleteCloudResource,
    getServiceSchema,
    listCloudResources,
} from '@/api/cloudProxyClient'
import {DynamicFormRenderer} from '@/components/DynamicFormRenderer'
import {ResourceInspector} from '@/components/ResourceInspector'
import {ResourceTable} from '@/components/ResourceTable'
import {StorageObjectBrowser} from '@/components/StorageObjectBrowser'
import type {CloudProvider, CloudServiceType, CloudStatus} from '@/types/cloud'
import type {CloudResource, StorageObject} from '@/types/resource'
import type {ServiceSchema} from '@/types/schema'

interface DynamicResourceViewProps {
    cloud: CloudProvider
    service: CloudServiceType
    cloudStatus?: CloudStatus
    statusLoading?: boolean
}

export function DynamicResourceView({cloud, service, cloudStatus, statusLoading = false}: DynamicResourceViewProps) {
    const qc = useQueryClient()
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<CloudResource | undefined>()
    const [selectedObject, setSelectedObject] = useState<StorageObject | undefined>()
    const [createOpen, setCreateOpen] = useState(false)
    const resourcesKey = useMemo(() => ['cloud-resources', cloud, service, search], [cloud, service, search])

    const schemaQuery = useQuery({
        queryKey: ['cloud-schema', cloud, service],
        queryFn: ({signal}) => getServiceSchema(cloud, service, signal),
    })

    const resourcesQuery = useQuery({
        queryKey: resourcesKey,
        queryFn: ({signal}) => listCloudResources(cloud, service, search, signal),
        enabled: schemaQuery.isSuccess && cloudStatus?.runtime === 'reachable',
    })

    const createMut = useMutation({
        mutationFn: (values: Record<string, unknown>) => createCloudResource(cloud, service, values),
        onSuccess: (resource) => {
            setSelected(resource)
            setCreateOpen(false)
            void qc.invalidateQueries({queryKey: ['cloud-resources', cloud, service]})
        },
    })

    const deleteMut = useMutation({
        mutationFn: (resource: CloudResource) => deleteCloudResource(cloud, service, resource.id),
        onSuccess: (_, resource) => {
            if (selected?.id === resource.id) setSelected(undefined)
            void qc.invalidateQueries({queryKey: ['cloud-resources', cloud, service]})
        },
    })

    useEffect(() => {
        setSelected(undefined)
        setSelectedObject(undefined)
        setCreateOpen(false)
        setSearch('')
    }, [cloud, service])

    useEffect(() => {
        setSelectedObject(undefined)
    }, [selected?.id])

    if (schemaQuery.isLoading) {
        return <div className="empty compact"><h3>Loading schema</h3></div>
    }

    if (schemaQuery.isError || !schemaQuery.data) {
        return (
            <div className="cloud-coming-soon">
                <div>
                    <p className="eyebrow">Coming Soon</p>
                    <h3>{cloud.toUpperCase()} {service}</h3>
                    <p className="muted">The proxy already exposes this provider as a placeholder. No adapter is registered yet.</p>
                </div>
                <div className="coming-soon-grid">
                    <StatusTile label="Cloud" value={cloud.toUpperCase()} state="placeholder"/>
                    <StatusTile label="Service" value={service} state="placeholder"/>
                    <StatusTile label="Adapter" value="Not registered" state="pending"/>
                    <StatusTile label="Runtime" value="Future" state="pending"/>
                </div>
            </div>
        )
    }

    const schema = schemaQuery.data
    const resources = resourcesQuery.data ?? []
    const activeSelected = selected?.cloud === cloud && selected.service === service ? selected : undefined
    const createResourceLabel = resourceCreateLabel(schema)
    const runtimeState = statusLoading
        ? 'Checking runtime'
        : cloudStatus?.runtime === 'reachable'
            ? 'Runtime reachable'
            : cloudStatus?.runtime === 'unavailable'
                ? 'Runtime unavailable'
                : 'Coming soon'
    const runtimeClass = cloudStatus?.runtime === 'unavailable' ? 'unavailable' : cloudStatus?.runtime === 'reachable' ? 'ready' : 'pending'
    const adapterState = cloudStatus?.adapterRegistered ? 'Adapter ready' : 'Adapter pending'
    const resourceState = resourceStateFor(cloudStatus, statusLoading, resourcesQuery.isLoading, resourcesQuery.isError)
    const canUseRuntime = cloudStatus?.runtime === 'reachable'

    return (
        <div className="dynamic-resource-view">
            <section className="dynamic-stage">
                <div className="dynamic-stage-header">
                    <div>
                        <p className="eyebrow">Dynamic View</p>
                        <h3>{schema.displayName}</h3>
                    </div>
                    <div className="schema-action-list">
                        <span className={`runtime-state ${runtimeClass}`}>{runtimeState}</span>
                        <span className={`runtime-state ${cloudStatus?.adapterRegistered ? 'ready' : 'pending'}`}>{adapterState}</span>
                        <span className={`runtime-state ${resourceState.className}`}>{resourceState.label}</span>
                        <span className="schema-action resource-count">{resources.length} resources</span>
                    </div>
                </div>

                <div className="dynamic-stage-grid">
                    <FeatureTile icon={Filter} title="Dynamic Filters" value={`${schema.filters.length}`} detail="Schema-driven search and future filters"/>
                    <FeatureTile icon={Table2} title="Resources Table" value={`${schema.columns.length} columns`} detail="Normalized across AWS and Azure"/>
                    <FeatureTile icon={Workflow} title="Dynamic Actions" value={schema.actions.join(', ')} detail="Rendered from adapter capabilities"/>
                    <FeatureTile icon={Eye} title="Resource Inspector" value="Enabled" detail="Same normalized resource contract"/>
                </div>
            </section>

            <div className="resource-workbench">
                <section className="resource-main">
                    <section className="table-panel">
                        <div className="input-row resource-table-bar">
                            <div>
                                <p className="eyebrow">Resources</p>
                                <span className="muted">{resources.length} normalized resources</span>
                            </div>
                            <div className="resource-table-tools">
                                <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter resources"/>
                                <button className="button" type="button" disabled={!canUseRuntime} onClick={() => setCreateOpen((open) => !open)}>
                                    <Plus size={14}/>
                                    {createResourceLabel}
                                    {createOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                                </button>
                                <button className="button" type="button" disabled={!canUseRuntime || resourcesQuery.isFetching} onClick={() => resourcesQuery.refetch()}>
                                    <RefreshCw size={14}/>
                                    {resourcesQuery.isFetching ? 'Loading' : 'Refresh'}
                                </button>
                            </div>
                        </div>
                        {createOpen && (
                            <div className="resource-create-inline">
                                <DynamicFormRenderer
                                    schema={schema}
                                    isSubmitting={createMut.isPending}
                                    submitLabel={createResourceLabel}
                                    pendingLabel="Creating"
                                    submitError={createMut.error instanceof Error ? createMut.error.message : null}
                                    onSubmit={(values) => createMut.mutate(values)}
                                />
                            </div>
                        )}
                        {renderResourceSurface({
                            schema,
                            resources,
                            selectedId: activeSelected?.id,
                            deletingId: deleteMut.variables?.id,
                            cloudStatus,
                            statusLoading,
                            resourcesLoading: resourcesQuery.isLoading,
                            resourcesError: resourcesQuery.error,
                            onSelect: setSelected,
                            onDelete: (resource) => deleteMut.mutate(resource),
                        })}
                    </section>
                </section>
                <ResourceInspector resource={activeSelected} object={selectedObject}/>
            </div>
            <StorageObjectBrowser
                cloud={cloud}
                resource={activeSelected}
                capabilities={schema.capabilities?.objectActions}
                selectedObjectKey={selectedObject?.key}
                onSelectObject={setSelectedObject}
            />
        </div>
    )
}

function resourceCreateLabel(schema: ServiceSchema): string {
    if (schema.cloud === 'aws' && schema.service === 'storage') return 'Create bucket'
    if (schema.cloud === 'azure' && schema.service === 'storage') return 'Create container'
    return 'Create resource'
}

function FeatureTile({icon, title, value, detail}: {icon: ElementType; title: string; value: string; detail: string}) {
    const Icon = icon
    return (
        <div className="feature-tile">
            <Icon size={22}/>
            <span>{title}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    )
}

function StatusTile({label, value, state}: {label: string; value: string; state: 'placeholder' | 'pending'}) {
    return (
        <div className={`status-tile ${state}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    )
}

function resourceStateFor(
    status: CloudStatus | undefined,
    statusLoading: boolean,
    resourcesLoading: boolean,
    resourcesError: boolean,
): {label: string; className: 'ready' | 'pending' | 'unavailable'} {
    if (statusLoading) return {label: 'Checking resources', className: 'pending'}
    if (status?.runtime === 'unavailable') return {label: 'Resources blocked', className: 'unavailable'}
    if (status?.runtime === 'coming_soon') return {label: 'Resources pending', className: 'pending'}
    if (resourcesLoading) return {label: 'Loading resources', className: 'pending'}
    if (resourcesError) return {label: 'Resource error', className: 'unavailable'}
    return {label: 'Resources loaded', className: 'ready'}
}

function renderResourceSurface({
    schema,
    resources,
    selectedId,
    deletingId,
    cloudStatus,
    statusLoading,
    resourcesLoading,
    resourcesError,
    onSelect,
    onDelete,
}: {
    schema: ServiceSchema
    resources: CloudResource[]
    selectedId?: string
    deletingId?: string
    cloudStatus?: CloudStatus
    statusLoading: boolean
    resourcesLoading: boolean
    resourcesError: unknown
    onSelect: (resource: CloudResource) => void
    onDelete: (resource: CloudResource) => void
}) {
    if (statusLoading) {
        return <RuntimeNotice title="Checking runtime" detail="Waiting for the proxy to confirm the selected cloud runtime." state="pending"/>
    }
    if (cloudStatus?.runtime === 'unavailable') {
        return (
            <RuntimeNotice
                title="Runtime unavailable"
                detail={`${cloudStatus.endpoint ?? 'Runtime endpoint'} is not reachable. Start the selected runtime before loading resources.`}
                error={cloudStatus.error ?? undefined}
                state="unavailable"
            />
        )
    }
    if (resourcesError) {
        return (
            <RuntimeNotice
                title="Resource load failed"
                detail="The adapter is registered, but the proxy could not load resources from the selected runtime."
                error={resourcesError instanceof Error ? resourcesError.message : 'Unknown resource error'}
                state="unavailable"
            />
        )
    }
    if (resourcesLoading) {
        return <RuntimeNotice title="Loading resources" detail="Reading normalized resources from the selected cloud adapter." state="pending"/>
    }

    return (
        <ResourceTable
            schema={schema}
            resources={resources}
            selectedId={selectedId}
            deletingId={deletingId}
            onSelect={onSelect}
            onDelete={onDelete}
        />
    )
}

function RuntimeNotice({title, detail, error, state}: {title: string; detail: string; error?: string; state: 'pending' | 'unavailable'}) {
    return (
        <div className={`runtime-notice ${state}`}>
            <h3>{title}</h3>
            <p>{detail}</p>
            {error && <code>{error}</code>}
        </div>
    )
}
