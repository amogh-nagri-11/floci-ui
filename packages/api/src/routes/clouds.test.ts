import {describe, expect, test} from 'bun:test'
import {Hono} from 'hono'
import {awsStorageSchema, azureStorageSchema} from '../cloud-spi/storageSchema'
import type {CloudResource, CloudServiceAdapter, CreateResourceInput} from '../cloud-spi/types'
import {CloudAdapterRegistry} from '../registry/CloudAdapterRegistry'
import {CloudProxyService} from '../service/CloudProxyService'
import {createCloudRoutes} from './clouds'

function mockAdapter(cloud: 'aws' | 'azure', overrides: Partial<CloudServiceAdapter> = {}): CloudServiceAdapter {
    return {
        cloud,
        service: 'storage',
        schema: cloud === 'aws' ? awsStorageSchema : azureStorageSchema,
        list: async () => [],
        get: async () => null,
        create: async (_input: CreateResourceInput): Promise<CloudResource> => ({
            id: 'created',
            name: 'created',
            cloud,
            service: 'storage',
            type: cloud === 'aws' ? 'bucket' : 'container',
            region: null,
            createdAt: null,
            metadata: {},
        }),
        delete: async () => {},
        listObjects: async (resourceId: string, prefix = '') => ({
            prefix,
            objects: [{
                key: `${resourceId}/object.txt`,
                name: 'object.txt',
                type: 'object',
                size: 12,
                lastModified: null,
                metadata: {},
            }],
        }),
        ...overrides,
    }
}

function appWithRoutes(adapters: CloudServiceAdapter[] = [mockAdapter('aws'), mockAdapter('azure')]) {
    const app = new Hono()
    const registry = new CloudAdapterRegistry(adapters)
    app.route('/api/clouds', createCloudRoutes(new CloudProxyService(registry)))
    return app
}

describe('cloud schema routes', () => {
    test('returns AWS storage schema', async () => {
        const res = await appWithRoutes().request('/api/clouds/aws/services/storage/schema')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.cloud).toBe('aws')
        expect(body.service).toBe('storage')
        expect(body.fields[0].name).toBe('bucketName')
    })

    test('returns Azure storage schema', async () => {
        const res = await appWithRoutes().request('/api/clouds/azure/services/storage/schema')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.cloud).toBe('azure')
        expect(body.service).toBe('storage')
        expect(body.fields[0].name).toBe('containerName')
    })

    test('returns GCP storage schema', async () => {
        const res = await appWithRoutes().request('/api/clouds/gcp/services/storage/schema')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.cloud).toBe('gcp')
        expect(body.service).toBe('storage')
        expect(body.fields[0].name).toBe('bucketName')
    })

    test('returns provider k8s schemas without registered adapters', async () => {
        const azureRes = await appWithRoutes().request('/api/clouds/azure/services/k8s/schema')
        const azureBody = await azureRes.json()
        const gcpRes = await appWithRoutes().request('/api/clouds/gcp/services/k8s/schema')
        const gcpBody = await gcpRes.json()

        expect(azureRes.status).toBe(200)
        expect(azureBody.displayName).toBe('Azure AKS')
        expect(gcpRes.status).toBe(200)
        expect(gcpBody.displayName).toBe('Google GKE')
    })

    test('returns provider database schemas without registered adapters', async () => {
        const azureRes = await appWithRoutes().request('/api/clouds/azure/services/database/schema')
        const azureBody = await azureRes.json()
        const gcpRes = await appWithRoutes().request('/api/clouds/gcp/services/database/schema')
        const gcpBody = await gcpRes.json()

        expect(azureRes.status).toBe(200)
        expect(azureBody.displayName).toBe('Azure SQL Database')
        expect(gcpRes.status).toBe(200)
        expect(gcpBody.displayName).toBe('Cloud SQL')
    })

    test('returns AWS cloud status', async () => {
        const res = await appWithRoutes().request('/api/clouds/aws/status')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.cloud).toBe('aws')
        expect(body.adapterRegistered).toBe(true)
        expect(body.runtime).toBe('reachable')
    })

    test('returns GCP runtime status without a registered adapter', async () => {
        const res = await appWithRoutes().request('/api/clouds/gcp/status')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.cloud).toBe('gcp')
        expect(body.adapterRegistered).toBe(false)
        expect(body.runtime).toBe('unavailable')
        expect(body.endpoint).toBe('http://localhost:4588')
    })

    test('lists storage objects through the cloud adapter', async () => {
        const res = await appWithRoutes().request('/api/clouds/aws/services/storage/resources/demo/objects')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.objects).toHaveLength(1)
        expect(body.objects[0].name).toBe('object.txt')
    })

    test('normalizes runtime unavailable errors', async () => {
        const app = appWithRoutes([
            mockAdapter('aws', {
                list: async () => {
                    throw new Error('Cannot reach Floci-AZ at http://localhost:4577: connection refused')
                },
            }),
        ])
        const res = await app.request('/api/clouds/aws/services/storage/resources')
        const body = await res.json()

        expect(res.status).toBe(503)
        expect(body.code).toBe('runtime_unavailable')
        expect(body.message).toBe('Runtime unavailable')
        expect(body.detail).toContain('connection refused')
    })

    test('normalizes not implemented runtime errors', async () => {
        const app = appWithRoutes([
            mockAdapter('azure', {
                create: async () => {
                    throw new Error('Azure Blob request failed: HTTP 501')
                },
            }),
        ])
        const res = await app.request('/api/clouds/azure/services/storage/resources', {
            method: 'POST',
            body: JSON.stringify({containerName: 'demo'}),
        })
        const body = await res.json()

        expect(res.status).toBe(501)
        expect(body.code).toBe('operation_not_implemented')
        expect(body.message).toBe('Operation is not implemented by the selected runtime')
    })
})
