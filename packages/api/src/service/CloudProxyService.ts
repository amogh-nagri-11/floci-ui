import type {
    CloudDescriptor,
    CloudProvider,
    CloudResource,
    CloudServiceDescriptor,
    CloudServiceType,
    CloudStatus,
    CreateResourceInput,
    ResourceQuery,
    ServiceSchema,
    StorageObjectDownload,
    StorageObjectList,
} from '../cloud-spi/types'
import {storageSchemaFor} from '../cloud-spi/storageSchema'
import {CloudAdapterRegistry} from '../registry/CloudAdapterRegistry'
import {serverlessSchemaFor} from '../cloud-spi/serverlessSchema'
import {azureEndpoint} from '../azure'

export class CloudProxyService {
    constructor(private readonly registry: CloudAdapterRegistry) {}

    clouds(): CloudDescriptor[] {
        return [
            {id: 'aws', displayName: 'AWS', availability: 'available'},
            {id: 'azure', displayName: 'Azure', availability: 'available'},
            {id: 'gcp', displayName: 'GCP Coming Soon', availability: 'coming_soon'},
        ]
    }

    services(cloud: CloudProvider): CloudServiceDescriptor[] {
        if (cloud === 'gcp') {
            return [{cloud, service: 'storage', displayName: 'Storage Coming Soon', availability: 'coming_soon'},
                  {cloud, service: 'serverless', displayName: 'Cloud Functions', availability: 'coming_soon'},
            ]
        }

        return [{
            cloud,
            service: 'storage',
            displayName: cloud === 'aws' ? 'S3 Storage' : 'Azure Blob Storage',
            availability: this.registry.get(cloud, 'storage') ? 'available' : 'coming_soon',
        },
        {
        cloud,
        service: 'serverless',
        displayName: cloud === 'aws' ? 'AWS Lambda' : 'Azure Functions',
        availability: 'available',
    },
]
    }

    schema(cloud: CloudProvider, service: CloudServiceType): ServiceSchema | null {
    const adapter = this.registry.get(cloud, service)

    if (adapter) return adapter.schema()

    if (service === 'serverless') {
        return serverlessSchemaFor(cloud)
    }

    return storageSchemaFor(cloud)
}

    async status(cloud: CloudProvider): Promise<CloudStatus> {
        const adapter = this.registry.get(cloud, 'storage')
        if (cloud === 'gcp' || !adapter) {
            return {
                cloud,
                adapterRegistered: false,
                runtime: 'coming_soon',
                endpoint: endpointFor(cloud),
                checkedAt: new Date().toISOString(),
                error: null,
            }
        }

        try {
            await adapter.list()
            return {
                cloud,
                adapterRegistered: true,
                runtime: 'reachable',
                endpoint: endpointFor(cloud),
                checkedAt: new Date().toISOString(),
                error: null,
            }
        } catch (error) {
            return {
                cloud,
                adapterRegistered: true,
                runtime: 'unavailable',
                endpoint: endpointFor(cloud),
                checkedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Runtime check failed',
            }
        }
    }

    async listResources(cloud: CloudProvider, service: CloudServiceType, query: ResourceQuery): Promise<CloudResource[]> {
        return this.requireAdapter(cloud, service).list(query)
    }

    async getResource(cloud: CloudProvider, service: CloudServiceType, id: string): Promise<CloudResource | null> {
        return this.requireAdapter(cloud, service).get(id)
    }

    async createResource(cloud: CloudProvider, service: CloudServiceType, input: CreateResourceInput): Promise<CloudResource> {
        return this.requireAdapter(cloud, service).create(input)
    }

    async deleteResource(cloud: CloudProvider, service: CloudServiceType, id: string): Promise<void> {
        await this.requireAdapter(cloud, service).delete(id)
    }

    async listObjects(cloud: CloudProvider, service: CloudServiceType, resourceId: string, prefix?: string): Promise<StorageObjectList> {
        const adapter = this.requireAdapter(cloud, service)
        if (!adapter.listObjects) throw new Error(`Object listing is not supported for ${cloud}/${service}`)
        return adapter.listObjects(resourceId, prefix)
    }

    async putObject(cloud: CloudProvider, service: CloudServiceType, resourceId: string, key: string, body: Uint8Array, contentType: string): Promise<void> {
        const adapter = this.requireAdapter(cloud, service)
        if (!adapter.putObject) throw new Error(`Object upload is not supported for ${cloud}/${service}`)
        await adapter.putObject(resourceId, key, body, contentType)
    }

    async getObject(cloud: CloudProvider, service: CloudServiceType, resourceId: string, key: string): Promise<StorageObjectDownload> {
        const adapter = this.requireAdapter(cloud, service)
        if (!adapter.getObject) throw new Error(`Object download is not supported for ${cloud}/${service}`)
        return adapter.getObject(resourceId, key)
    }

    async deleteObject(cloud: CloudProvider, service: CloudServiceType, resourceId: string, key: string): Promise<void> {
        const adapter = this.requireAdapter(cloud, service)
        if (!adapter.deleteObject) throw new Error(`Object delete is not supported for ${cloud}/${service}`)
        await adapter.deleteObject(resourceId, key)
    }

    async copyObject(cloud: CloudProvider, service: CloudServiceType, srcResourceId: string, srcKey: string, destKey: string, destResourceId?: string): Promise<void> {
        const adapter = this.requireAdapter(cloud, service)
        if (!adapter.copyObject) throw new Error(`Object copy is not supported for ${cloud}/${service}`)
        await adapter.copyObject(srcResourceId, srcKey, destKey, destResourceId)
    }

    private requireAdapter(cloud: CloudProvider, service: CloudServiceType) {
        const adapter = this.registry.get(cloud, service)
        if (!adapter) throw new Error(`No adapter registered for ${cloud}/${service}`)
        return adapter
    }
}

function endpointFor(cloud: CloudProvider): string | null {
    if (cloud === 'aws') return process.env.FLOCI_ENDPOINT ?? 'http://localhost:4566'
    if (cloud === 'azure') return azureEndpoint()
    return null
}
