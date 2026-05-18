import {Hono} from 'hono'
import type {CloudProvider, CloudServiceType} from '../cloud-spi/types'
import {createCloudProxyService} from '../cloudProxy'
import {CloudProxyService} from '../service/CloudProxyService'

export function createCloudRoutes(service: CloudProxyService = createCloudProxyService()) {
    const app = new Hono()

    app.get('/', (c) => c.json(service.clouds()))

    app.get('/:cloud/services', (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        if (!isCloudProvider(cloud)) return c.json({error: 'Unknown cloud'}, 404)
        return c.json(service.services(cloud))
    })

    app.get('/:cloud/status', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        if (!isCloudProvider(cloud)) return c.json({error: 'Unknown cloud'}, 404)
        return c.json(await service.status(cloud))
    })

    app.get('/:cloud/services/:service/schema', (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const schema = service.schema(cloud, serviceType)
        if (!schema || service.services(cloud).find((item) => item.service === serviceType)?.availability !== 'available') {
            return c.json({error: 'Schema not available'}, 404)
        }

        return c.json(schema)
    })

    app.get('/:cloud/services/:service/resources', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const resources = await service.listResources(cloud, serviceType, {search: c.req.query('search')})
        return c.json(resources)
    })

    app.get('/:cloud/services/:service/resources/:id', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const resource = await service.getResource(cloud, serviceType, c.req.param('id'))
        if (!resource) return c.json({error: 'Resource not found'}, 404)
        return c.json(resource)
    })

    app.get('/:cloud/services/:service/resources/:id/objects', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const objects = await service.listObjects(cloud, serviceType, c.req.param('id'), c.req.query('prefix') ?? '')
        return c.json(objects)
    })

    app.put('/:cloud/services/:service/resources/:id/object', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const key = c.req.query('key') ?? ''
        if (!key) return c.json({error: 'Object key is required'}, 400)
        const body = new Uint8Array(await c.req.arrayBuffer())
        const contentType = c.req.header('content-type') ?? 'application/octet-stream'
        await service.putObject(cloud, serviceType, c.req.param('id'), key, body, contentType)
        return c.json({ok: true})
    })

    app.get('/:cloud/services/:service/resources/:id/object', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const key = c.req.query('key') ?? ''
        if (!key) return c.json({error: 'Object key is required'}, 400)
        const object = await service.getObject(cloud, serviceType, c.req.param('id'), key)
        return new Response(object.body, {
            headers: {
                'content-type': object.contentType,
                ...(object.contentLength === null ? {} : {'content-length': String(object.contentLength)}),
                'content-disposition': `attachment; filename="${key.split('/').pop() ?? key}"`,
            },
        })
    })

    app.delete('/:cloud/services/:service/resources/:id/object', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const key = c.req.query('key') ?? ''
        if (!key) return c.json({error: 'Object key is required'}, 400)
        await service.deleteObject(cloud, serviceType, c.req.param('id'), key)
        return c.json({ok: true})
    })

    app.post('/:cloud/services/:service/resources', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const values = await c.req.json<Record<string, unknown>>()
        const resource = await service.createResource(cloud, serviceType, {values})
        return c.json(resource, 201)
    })

    app.delete('/:cloud/services/:service/resources/:id', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        await service.deleteResource(cloud, serviceType, c.req.param('id'))
        return c.json({ok: true})
    })

    return app
}

function isCloudProvider(value: string): value is CloudProvider {
    return value === 'aws' || value === 'azure' || value === 'gcp'
}

function isServiceType(value: string): value is CloudServiceType {
    return value === 'storage'
}

export default createCloudRoutes()
