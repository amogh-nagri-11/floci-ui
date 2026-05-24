import {type ElementType, useMemo} from 'react'
import {Cloud, DatabaseZap, Radio, Route, ShieldCheck} from 'lucide-react'
import {Navigate, useNavigate, useParams} from 'react-router-dom'
import {useQuery} from '@tanstack/react-query'
import {getCloudStatus, listClouds, listCloudServices} from '@/api/cloudProxyClient'
import {CloudSelector} from '@/components/CloudSelector'
import {DynamicResourceView} from '@/components/DynamicResourceView'
import type {CloudProvider, CloudServiceDescriptor, CloudServiceType, CloudStatus} from '@/types/cloud'

export function CloudExplorerPage() {
    const navigate = useNavigate()
    const params = useParams()
    const routeCloud = normalizeCloud(params.cloud)
    const routeService = normalizeService(params.service)
    const cloud = routeCloud ?? 'aws'
    const service = routeService ?? 'storage'

    const cloudsQuery = useQuery({
        queryKey: ['clouds'],
        queryFn: ({signal}) => listClouds(signal),
    })

    const servicesQuery = useQuery({
        queryKey: ['cloud-services', cloud],
        queryFn: ({signal}) => listCloudServices(cloud, signal),
    })

    const statusQuery = useQuery({
        queryKey: ['cloud-status', cloud],
        queryFn: ({signal}) => getCloudStatus(cloud, signal),
        refetchInterval: 10_000,
    })

    const selectedService = useMemo(
        () => servicesQuery.data?.find((item) => item.service === service),
        [service, servicesQuery.data],
    )

    if (!routeCloud || !routeService) {
        return <Navigate to="/cloud-explorer/aws/storage" replace/>
    }

    return (
        <>
            <div className="page-header cloud-explorer-header">
                <div className="page-title">
                    <Cloud size={20}/>
                    <div>
                        <h2>Cloud Explorer</h2>
                        <p className="muted">Unified local runtime console</p>
                    </div>
                </div>
                <div className="cloud-header-selectors">
                    <label>
                        <span>Cloud</span>
                        <CloudSelector
                            clouds={cloudsQuery.data ?? []}
                            selected={cloud}
                            onSelect={(nextCloud) => navigate(`/cloud-explorer/${nextCloud}/storage`)}
                        />
                    </label>
                </div>
            </div>
            <div className="content cloud-explorer">
                <div className="cloud-runtime-strip">
                    <div className="runtime-card">
                        <DatabaseZap size={16}/>
                        <div>
                            <span>Proxy API</span>
                            <strong>/api/clouds/{cloud}/services/{service}</strong>
                        </div>
                    </div>
                    <RuntimeCard icon={Route} label="Service" value={selectedService?.displayName ?? service} detail={serviceAvailability(selectedService)}/>
                    <RuntimeCard icon={Radio} label="Runtime" value={runtimeValue(cloud, statusQuery.data)} detail={runtimeDetail(statusQuery.data, statusQuery.isLoading)} state={runtimeState(statusQuery.data, statusQuery.isLoading)}/>
                    <RuntimeCard icon={ShieldCheck} label="Adapter" value={adapterValue(cloud, statusQuery.data)} detail={adapterDetail(statusQuery.data, statusQuery.isLoading)} state={adapterState(cloud, statusQuery.data)}/>
                    <div className={`runtime-card status ${runtimeState(statusQuery.data, statusQuery.isLoading)}`}>
                        <span>Connection</span>
                        <strong>{connectionValue(statusQuery.data, statusQuery.isLoading)}</strong>
                        <small>{statusQuery.data?.endpoint ?? 'No runtime endpoint'}</small>
                    </div>
                </div>
                <DynamicResourceView cloud={cloud} service={service} cloudStatus={statusQuery.data} statusLoading={statusQuery.isLoading}/>
            </div>
        </>
    )
}

function normalizeCloud(value?: string): CloudProvider | null {
    return value === 'aws' || value === 'azure' || value === 'gcp' ? value : null
}

function normalizeService(value?: string): CloudServiceType | null {
    return value === 'storage' || value === 'k8s' || value === 'database' || value === 'compute' ? value : null
}

function RuntimeCard({
    icon,
    label,
    value,
    detail,
    state,
}: {
    icon: ElementType
    label: string
    value: string
    detail: string
    state?: 'ready' | 'pending' | 'unavailable'
}) {
    const Icon = icon
    return (
        <div className={`runtime-card ${state ?? ''}`}>
            <Icon size={16}/>
            <div>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
            </div>
        </div>
    )
}

function serviceAvailability(service?: CloudServiceDescriptor): string {
    if (!service) return 'Loading service schema'
    return service.availability === 'available' ? 'Schema available' : 'Coming soon'
}

function runtimeValue(cloud: CloudProvider, status?: CloudStatus): string {
    if (status?.endpoint) return status.endpoint.replace(/^https?:\/\//, '')
    if (cloud === 'aws') return 'localhost:4566'
    if (cloud === 'azure') return 'localhost:4577'
    return 'Future Floci-GP'
}

function runtimeDetail(status?: CloudStatus, loading?: boolean): string {
    if (loading) return 'Checking runtime'
    if (!status) return 'Status unavailable'
    if (status.runtime === 'reachable') return 'Runtime reachable'
    if (status.runtime === 'unavailable') return status.error ?? 'Runtime unavailable'
    return 'Runtime coming soon'
}

function runtimeState(status?: CloudStatus, loading?: boolean): 'ready' | 'pending' | 'unavailable' {
    if (loading || !status || status.runtime === 'coming_soon') return 'pending'
    return status.runtime === 'reachable' ? 'ready' : 'unavailable'
}

function adapterValue(cloud: CloudProvider, status?: CloudStatus): string {
    if (cloud === 'gcp') return 'GCP Adapter'
    if (status?.adapterRegistered === false) return 'Not registered'
    return `${cloud.toUpperCase()} Adapter`
}

function adapterDetail(status?: CloudStatus, loading?: boolean): string {
    if (loading) return 'Checking adapter'
    if (!status) return 'Adapter status unknown'
    return status.adapterRegistered ? 'Adapter ready' : 'Coming soon'
}

function adapterState(cloud: CloudProvider, status?: CloudStatus): 'ready' | 'pending' | 'unavailable' {
    if (cloud === 'gcp' || !status || !status.adapterRegistered) return 'pending'
    return 'ready'
}

function connectionValue(status?: CloudStatus, loading?: boolean): string {
    if (loading) return 'Checking'
    if (!status) return 'Unknown'
    if (status.runtime === 'reachable') return 'Connected'
    if (status.runtime === 'unavailable') return 'Not connected'
    return 'Coming soon'
}
