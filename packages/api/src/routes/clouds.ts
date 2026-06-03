import {Hono} from 'hono'
import type {Context} from 'hono'
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
        if (!schema) {
            return c.json({error: 'Schema not available'}, 404)
        }

        return c.json(schema)
    })

    app.get('/:cloud/services/:service/resources', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        return withRuntime(c, async () => {
            const resources = await service.listResources(cloud, serviceType, {search: c.req.query('search')})
            return c.json(resources)
        })
    })

    app.get('/:cloud/services/:service/resources/:id', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        return withRuntime(c, async () => {
            const resource = await service.getResource(cloud, serviceType, c.req.param('id'))
            if (!resource) return c.json({error: 'Resource not found'}, 404)
            return c.json(resource)
        })
    })

    app.get('/:cloud/services/:service/resources/:id/objects', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        return withRuntime(c, async () => {
            const objects = await service.listObjects(cloud, serviceType, c.req.param('id'), c.req.query('prefix') ?? '')
            return c.json(objects)
        })
    })

    app.put('/:cloud/services/:service/resources/:id/object', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const key = c.req.query('key') ?? ''
        if (!key) return c.json({error: 'Object key is required'}, 400)
        const body = new Uint8Array(await c.req.arrayBuffer())
        const contentType = c.req.header('content-type') ?? 'application/octet-stream'
        return withRuntime(c, async () => {
            await service.putObject(cloud, serviceType, c.req.param('id'), key, body, contentType)
            return c.json({ok: true})
        })
    })

    app.get('/:cloud/services/:service/resources/:id/object', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const key = c.req.query('key') ?? ''
        if (!key) return c.json({error: 'Object key is required'}, 400)
        return withRuntime(c, async () => {
            const object = await service.getObject(cloud, serviceType, c.req.param('id'), key)
            return new Response(object.body, {
                headers: {
                    'content-type': object.contentType,
                    ...(object.contentLength === null ? {} : {'content-length': String(object.contentLength)}),
                    'content-disposition': `attachment; filename="${key.split('/').pop() ?? key}"`,
                },
            })
        })
    })

    app.delete('/:cloud/services/:service/resources/:id/object', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const key = c.req.query('key') ?? ''
        if (!key) return c.json({error: 'Object key is required'}, 400)
        return withRuntime(c, async () => {
            await service.deleteObject(cloud, serviceType, c.req.param('id'), key)
            return c.json({ok: true})
        })
    })

    app.post('/:cloud/services/:service/resources/:id/object/copy', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        const {srcKey, destKey, destResourceId} = await c.req.json<{srcKey: string; destKey: string; destResourceId?: string}>()
        if (!srcKey || !destKey) return c.json({error: 'srcKey and destKey are required'}, 400)

        return withRuntime(c, async () => {
            await service.copyObject(cloud, serviceType, c.req.param('id'), srcKey, destKey, destResourceId)
            return c.json({ok: true})
        })
    })

    app.post('/:cloud/services/:service/resources', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        return withRuntime(c, async () => {
            const values = await c.req.json<Record<string, unknown>>()
            const resource = await service.createResource(cloud, serviceType, {values})
            return c.json(resource, 201)
        })
    })

    app.delete('/:cloud/services/:service/resources/:id', async (c) => {
        const cloud = c.req.param('cloud') as CloudProvider
        const serviceType = c.req.param('service') as CloudServiceType
        if (!isCloudProvider(cloud) || !isServiceType(serviceType)) return c.json({error: 'Unknown cloud or service'}, 404)

        return withRuntime(c, async () => {
            await service.deleteResource(cloud, serviceType, c.req.param('id'))
            return c.json({ok: true})
        })
    })

    return app
}

function isCloudProvider(value: string): value is CloudProvider {
    return value === 'aws' || value === 'azure' || value === 'gcp'
}

function isServiceType(value: string): value is CloudServiceType {
    return value === 'storage' || value === 'k8s' || value === 'database' || value === 'serverless' || value === 'compute' || value === 'networking'
}

async function withRuntime(c: Context, handler: () => Promise<Response>): Promise<Response> {
    try {
        return await handler()
    } catch (err) {
        const error = normalizeRuntimeError(err)
        return c.json(error.body, error.status)
    }
}

function normalizeRuntimeError(err: unknown): {
    status: 400 | 404 | 501 | 502 | 503
    body: {error: string; code: string; message: string; detail?: string}
} {
    const message = err instanceof Error ? err.message : 'Runtime request failed'

    if (message.includes('Cannot reach')) {
        return errorResponse(503, 'runtime_unavailable', 'Runtime unavailable', message)
    }

    if (message.includes('HTTP 501') || message.includes('NotImplemented')) {
        return errorResponse(501, 'operation_not_implemented', 'Operation is not implemented by the selected runtime', message)
    }

    if (message.includes('not found') || message.includes('NotFound') || message.includes('NoSuchBucket') || message.includes('NoSuchKey')) {
        return errorResponse(404, 'resource_not_found', 'Resource not found', message)
    }

    if (message.includes('is not supported') || message.includes('No adapter registered')) {
        return errorResponse(501, 'operation_not_supported', 'Operation is not supported by this adapter', message)
    }

    if (message.includes('is required') || message.includes('Use a valid')) {
        return errorResponse(400, 'invalid_request', message)
    }

    return errorResponse(502, 'runtime_error', 'Runtime request failed', message)
}

function errorResponse(
    status: 400 | 404 | 501 | 502 | 503,
    code: string,
    message: string,
    detail?: string,
): {
    status: 400 | 404 | 501 | 502 | 503
    body: {error: string; code: string; message: string; detail?: string}
} {
    return {
        status,
        body: {
            error: message,
            code,
            message,
            ...(detail && detail !== message ? {detail} : {}),
        },
    }
}

export default createCloudRoutes()
