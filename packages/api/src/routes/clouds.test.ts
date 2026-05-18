import {describe, expect, test} from 'bun:test'
import {Hono} from 'hono'
import {awsStorageSchema, azureStorageSchema} from '../cloud-spi/storageSchema'
import type {CloudResource, CloudServiceAdapter, CreateResourceInput} from '../cloud-spi/types'
import {CloudAdapterRegistry} from '../registry/CloudAdapterRegistry'
import {CloudProxyService} from '../service/CloudProxyService'
import {createCloudRoutes} from './clouds'

function mockAdapter(cloud: 'aws' | 'azure'): CloudServiceAdapter {
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
    }
}

function appWithRoutes() {
    const app = new Hono()
    const registry = new CloudAdapterRegistry([mockAdapter('aws'), mockAdapter('azure')])
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

    test('keeps GCP as coming soon without schema', async () => {
        const res = await appWithRoutes().request('/api/clouds/gcp/services/storage/schema')

        expect(res.status).toBe(404)
    })

    test('returns AWS cloud status', async () => {
        const res = await appWithRoutes().request('/api/clouds/aws/status')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.cloud).toBe('aws')
        expect(body.adapterRegistered).toBe(true)
        expect(body.runtime).toBe('reachable')
    })

    test('returns GCP as coming soon in cloud status', async () => {
        const res = await appWithRoutes().request('/api/clouds/gcp/status')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.cloud).toBe('gcp')
        expect(body.adapterRegistered).toBe(false)
        expect(body.runtime).toBe('coming_soon')
    })

    test('lists storage objects through the cloud adapter', async () => {
        const res = await appWithRoutes().request('/api/clouds/aws/services/storage/resources/demo/objects')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.objects).toHaveLength(1)
        expect(body.objects[0].name).toBe('object.txt')
    })
})
