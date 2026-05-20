import {useQuery} from '@tanstack/react-query'
import {
    getCloudStatus,
    listClouds,
    listCloudResources,
    listCloudServices,
} from '@/api/cloudProxyClient'
import type {CloudProvider, CloudServiceDescriptor, CloudServiceType, CloudStatus} from '@/types/cloud'

export const cloudConsoleHomeQueryKeys = {
    clouds: ['clouds'] as const,
    services: (cloud: CloudProvider) => ['cloud-services', cloud] as const,
    status: (cloud: CloudProvider) => ['cloud-status', cloud] as const,
    resources: (cloud: CloudProvider, service: CloudServiceType) => ['cloud-console-resources', cloud, service] as const,
}

export function useCloudsQuery() {
    return useQuery({
        queryKey: cloudConsoleHomeQueryKeys.clouds,
        queryFn: ({signal}) => listClouds(signal),
    })
}

export function useCloudServicesQuery(cloud: CloudProvider) {
    return useQuery({
        queryKey: cloudConsoleHomeQueryKeys.services(cloud),
        queryFn: ({signal}) => listCloudServices(cloud, signal),
    })
}

export function useCloudStatusQuery(cloud: CloudProvider) {
    return useQuery({
        queryKey: cloudConsoleHomeQueryKeys.status(cloud),
        queryFn: ({signal}) => getCloudStatus(cloud, signal),
        refetchInterval: 10_000,
    })
}

export function useCloudConsoleResourcesQuery({
    cloud,
    service,
    services,
    status,
}: {
    cloud: CloudProvider
    service: CloudServiceType
    services?: CloudServiceDescriptor[]
    status?: CloudStatus
}) {
    return useQuery({
        queryKey: cloudConsoleHomeQueryKeys.resources(cloud, service),
        queryFn: ({signal}) => listCloudResources(cloud, service, undefined, signal),
        enabled: hasAvailableService(services, service) && status?.runtime === 'reachable',
    })
}

function hasAvailableService(services: CloudServiceDescriptor[] | undefined, service: CloudServiceType): boolean {
    return services?.some((item) => item.service === service && item.availability === 'available') ?? false
}
