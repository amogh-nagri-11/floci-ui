import {useMemo, useState} from 'react'
import {ChevronDown, ChevronUp, Eye, Filter, Plus, RefreshCw, Table2, Workflow} from 'lucide-react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
    createCloudResource,
    deleteCloudResource,
    getCloudStatus,
    getServiceSchema,
    listCloudResources,
} from '@/api/cloudProxyClient'
import {DynamicFormRenderer} from '@/components/DynamicFormRenderer'
import {ResourceInspector} from '@/components/ResourceInspector'
import {ResourceTable} from '@/components/ResourceTable'
import {StorageObjectBrowser} from '@/components/StorageObjectBrowser'
import type {CloudProvider, CloudServiceType} from '@/types/cloud'
import type {CloudResource} from '@/types/resource'

interface DynamicResourceViewProps {
    cloud: CloudProvider
    service: CloudServiceType
}

export function DynamicResourceView({cloud, service}: DynamicResourceViewProps) {
    const qc = useQueryClient()
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<CloudResource | undefined>()
    const [createOpen, setCreateOpen] = useState(false)
    const resourcesKey = useMemo(() => ['cloud-resources', cloud, service, search], [cloud, service, search])

    const schemaQuery = useQuery({
        queryKey: ['cloud-schema', cloud, service],
        queryFn: ({signal}) => getServiceSchema(cloud, service, signal),
    })

    const statusQuery = useQuery({
        queryKey: ['cloud-status', cloud],
        queryFn: ({signal}) => getCloudStatus(cloud, signal),
        refetchInterval: 10_000,
    })

    const resourcesQuery = useQuery({
        queryKey: resourcesKey,
        queryFn: ({signal}) => listCloudResources(cloud, service, search, signal),
        enabled: schemaQuery.isSuccess,
    })

    const createMut = useMutation({
        mutationFn: (values: Record<string, unknown>) => createCloudResource(cloud, service, values),
        onSuccess: () => qc.invalidateQueries({queryKey: ['cloud-resources', cloud, service]}),
    })

    const deleteMut = useMutation({
        mutationFn: (resource: CloudResource) => deleteCloudResource(cloud, service, resource.id),
        onSuccess: (_, resource) => {
            if (selected?.id === resource.id) setSelected(undefined)
            void qc.invalidateQueries({queryKey: ['cloud-resources', cloud, service]})
        },
    })

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
    const runtimeState = statusQuery.isLoading
        ? 'Checking runtime'
        : statusQuery.data?.runtime === 'reachable'
            ? 'Runtime reachable'
            : statusQuery.data?.runtime === 'unavailable'
                ? 'Runtime unavailable'
                : 'Coming soon'
    const runtimeClass = statusQuery.data?.runtime === 'unavailable' ? 'unavailable' : 'ready'

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
                                <button className="button" type="button" onClick={() => setCreateOpen((open) => !open)}>
                                    <Plus size={14}/>
                                    Create
                                    {createOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                                </button>
                                <button className="button" type="button" onClick={() => resourcesQuery.refetch()}>
                                    <RefreshCw size={14}/>
                                    Refresh
                                </button>
                            </div>
                        </div>
                        {createOpen && (
                            <div className="resource-create-inline">
                                <DynamicFormRenderer schema={schema} isSubmitting={createMut.isPending} onSubmit={(values) => createMut.mutate(values)}/>
                            </div>
                        )}
                        <ResourceTable
                            schema={schema}
                            resources={resources}
                            selectedId={selected?.id}
                            deletingId={deleteMut.variables?.id}
                            onSelect={setSelected}
                            onDelete={(resource) => deleteMut.mutate(resource)}
                        />
                    </section>
                </section>
                <ResourceInspector resource={selected}/>
            </div>
            <StorageObjectBrowser cloud={cloud} resource={selected}/>
        </div>
    )
}

function FeatureTile({icon, title, value, detail}: {icon: React.ElementType; title: string; value: string; detail: string}) {
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
