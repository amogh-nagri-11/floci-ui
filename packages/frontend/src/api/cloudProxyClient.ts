import {apiDelete, apiGet, apiPost} from './floci-client'
import type {CloudDescriptor, CloudProvider, CloudServiceDescriptor, CloudServiceType, CloudStatus} from '@/types/cloud'
import type {CloudResource, StorageObjectList} from '@/types/resource'
import type {ServiceSchema} from '@/types/schema'

export function listClouds(signal?: AbortSignal): Promise<CloudDescriptor[]> {
    return apiGet('/clouds', 'cloud-proxy', signal)
}

export function listCloudServices(cloud: CloudProvider, signal?: AbortSignal): Promise<CloudServiceDescriptor[]> {
    return apiGet(`/clouds/${cloud}/services`, 'cloud-proxy', signal)
}

export function getCloudStatus(cloud: CloudProvider, signal?: AbortSignal): Promise<CloudStatus> {
    return apiGet(`/clouds/${cloud}/status`, 'cloud-proxy', signal)
}

export function getServiceSchema(cloud: CloudProvider, service: CloudServiceType, signal?: AbortSignal): Promise<ServiceSchema> {
    return apiGet(`/clouds/${cloud}/services/${service}/schema`, 'cloud-proxy', signal)
}

export function listCloudResources(
    cloud: CloudProvider,
    service: CloudServiceType,
    search?: string,
    signal?: AbortSignal,
): Promise<CloudResource[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : ''
    return apiGet(`/clouds/${cloud}/services/${service}/resources${qs}`, 'cloud-proxy', signal)
}

export function getCloudResource(
    cloud: CloudProvider,
    service: CloudServiceType,
    id: string,
    signal?: AbortSignal,
): Promise<CloudResource> {
    return apiGet(`/clouds/${cloud}/services/${service}/resources/${encodeURIComponent(id)}`, 'cloud-proxy', signal)
}

export function createCloudResource(
    cloud: CloudProvider,
    service: CloudServiceType,
    values: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<CloudResource> {
    return apiPost(`/clouds/${cloud}/services/${service}/resources`, 'cloud-proxy', values, signal)
}

export function deleteCloudResource(cloud: CloudProvider, service: CloudServiceType, id: string, signal?: AbortSignal): Promise<void> {
    return apiDelete(`/clouds/${cloud}/services/${service}/resources/${encodeURIComponent(id)}`, 'cloud-proxy', signal)
}

export function listStorageObjects(
    cloud: CloudProvider,
    resourceId: string,
    prefix?: string,
    signal?: AbortSignal,
): Promise<StorageObjectList> {
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
    return apiGet(`/clouds/${cloud}/services/storage/resources/${encodeURIComponent(resourceId)}/objects${qs}`, 'cloud-proxy', signal)
}

export async function uploadStorageObject(cloud: CloudProvider, resourceId: string, key: string, file: File | Blob, signal?: AbortSignal): Promise<void> {
    const res = await fetch(`/api/clouds/${cloud}/services/storage/resources/${encodeURIComponent(resourceId)}/object?key=${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: {'Content-Type': file.type || 'application/octet-stream'},
        body: file,
        signal,
    })
    if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`)
}

export function storageObjectDownloadUrl(cloud: CloudProvider, resourceId: string, key: string): string {
    return `/api/clouds/${cloud}/services/storage/resources/${encodeURIComponent(resourceId)}/object?key=${encodeURIComponent(key)}`
}

export function deleteStorageObject(cloud: CloudProvider, resourceId: string, key: string, signal?: AbortSignal): Promise<void> {
    return apiDelete(`/clouds/${cloud}/services/storage/resources/${encodeURIComponent(resourceId)}/object?key=${encodeURIComponent(key)}`, 'cloud-proxy', signal)
}
