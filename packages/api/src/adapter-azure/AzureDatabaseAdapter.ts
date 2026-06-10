import {azure, type AzureRuntimeClient} from '../azure'
import {azureDatabaseSchema} from '../cloud-spi/databaseSchema'
import type {
    CloudResource,
    CloudServiceAdapter,
    CosmosContainer,
    CosmosItem,
    CosmosQueryResult,
    CreateResourceInput,
    ResourceQuery,
    ServiceSchema,
} from '../cloud-spi/types'

interface CosmosListResponse<T> {
    _count?: number
    Databases?: T[]
    DocumentCollections?: T[]
    Documents?: T[]
}

type CosmosRecord = Record<string, unknown>

export class AzureDatabaseAdapter implements CloudServiceAdapter {
    readonly cloud = 'azure' as const
    readonly service = 'database' as const

    constructor(private readonly client: AzureRuntimeClient = azure) {}

    schema(): ServiceSchema {
        return azureDatabaseSchema()
    }

    async list(query: ResourceQuery = {}): Promise<CloudResource[]> {
        const body = await this.cosmosJson<CosmosListResponse<CosmosRecord>>('/dbs', {method: 'GET'}, {emptyOnNotFound: true})
        const databases = body?.Databases ?? []
        return filterBySearch(databases.map(toDatabaseResource), query.search)
    }

    async get(id: string): Promise<CloudResource | null> {
        const body = await this.cosmosJson<CosmosRecord>(`/dbs/${encodeSegment(id)}`, {method: 'GET'}, {emptyOnNotFound: true})
        return body ? toDatabaseResource(body) : null
    }

    async create(input: CreateResourceInput): Promise<CloudResource> {
        const databaseName = stringValue(input.values.databaseName)
        if (!databaseName) throw new Error('databaseName is required')
        if (!isValidCosmosId(databaseName)) throw new Error('Use a valid Cosmos database name.')

        const body = await this.cosmosJson<CosmosRecord>('/dbs', {
            method: 'POST',
            body: JSON.stringify({id: databaseName}),
        })
        if (!body) throw new Error('Cosmos database creation returned an empty response')
        return toDatabaseResource(body)
    }

    async delete(id: string): Promise<void> {
        await this.cosmosFetch(`/dbs/${encodeSegment(id)}`, {method: 'DELETE'})
    }

    async listCosmosContainers(databaseId: string): Promise<CosmosContainer[]> {
        const body = await this.cosmosJson<CosmosListResponse<CosmosRecord>>(
            `/dbs/${encodeSegment(databaseId)}/colls`,
            {method: 'GET'},
            {emptyOnNotFound: true},
        )
        return (body?.DocumentCollections ?? []).map((container) => toContainer(databaseId, container))
    }

    async createCosmosContainer(databaseId: string, input: CreateResourceInput): Promise<CosmosContainer> {
        const containerName = stringValue(input.values.containerName)
        const partitionKeyPath = normalizePartitionKeyPath(stringValue(input.values.partitionKeyPath) || '/id')
        if (!containerName) throw new Error('containerName is required')
        if (!isValidCosmosId(containerName)) throw new Error('Use a valid Cosmos container name.')

        const body = await this.cosmosJson<CosmosRecord>(`/dbs/${encodeSegment(databaseId)}/colls`, {
            method: 'POST',
            body: JSON.stringify({
                id: containerName,
                partitionKey: {paths: [partitionKeyPath], kind: 'Hash'},
            }),
        })
        if (!body) throw new Error('Cosmos container creation returned an empty response')
        return toContainer(databaseId, body)
    }

    async deleteCosmosContainer(databaseId: string, containerId: string): Promise<void> {
        await this.cosmosFetch(`/dbs/${encodeSegment(databaseId)}/colls/${encodeSegment(containerId)}`, {method: 'DELETE'})
    }

    async listCosmosItems(databaseId: string, containerId: string): Promise<CosmosItem[]> {
        const body = await this.cosmosJson<CosmosListResponse<CosmosRecord>>(
            `/dbs/${encodeSegment(databaseId)}/colls/${encodeSegment(containerId)}/docs`,
            {method: 'GET'},
            {emptyOnNotFound: true},
        )
        return (body?.Documents ?? []).map((document) => toItem(databaseId, containerId, document))
    }

    async upsertCosmosItem(databaseId: string, containerId: string, document: Record<string, unknown>): Promise<CosmosItem> {
        if (!isRecord(document)) throw new Error('document must be a JSON object')
        const id = stringValue(document.id)
        if (!id) throw new Error('Cosmos document id is required')

        const body = await this.cosmosJson<CosmosRecord>(`/dbs/${encodeSegment(databaseId)}/colls/${encodeSegment(containerId)}/docs`, {
            method: 'POST',
            body: JSON.stringify(document),
            headers: {'x-ms-documentdb-is-upsert': 'True'},
        })
        if (!body) throw new Error('Cosmos document upsert returned an empty response')
        return toItem(databaseId, containerId, body)
    }

    async deleteCosmosItem(databaseId: string, containerId: string, itemId: string): Promise<void> {
        await this.cosmosFetch(
            `/dbs/${encodeSegment(databaseId)}/colls/${encodeSegment(containerId)}/docs/${encodeSegment(itemId)}`,
            {method: 'DELETE'},
        )
    }

    async queryCosmosItems(databaseId: string, containerId: string, query: string): Promise<CosmosQueryResult> {
        const sql = query.trim() || 'SELECT * FROM c'
        const body = await this.cosmosJson<CosmosListResponse<Record<string, unknown> | string | number | boolean | null>>(
            `/dbs/${encodeSegment(databaseId)}/colls/${encodeSegment(containerId)}/docs`,
            {
                method: 'POST',
                body: JSON.stringify({query: sql, parameters: []}),
                headers: {
                    'content-type': 'application/query+json',
                    'x-ms-documentdb-isquery': 'True',
                    'x-ms-documentdb-query-enablecrosspartition': 'True',
                },
            },
        )
        if (!body) throw new Error('Cosmos query returned an empty response')
        const items = body.Documents ?? []
        return {items, count: body._count ?? items.length}
    }

    private cosmosFetch(path: string, init: RequestInit, options?: {emptyOnNotFound?: boolean}): Promise<Response | null> {
        const request: RequestInit = {
            ...init,
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                ...(init.headers ?? {}),
            },
        }
        return this.fetchWithFallbacks(path, request, options)
    }

    private async cosmosJson<T>(path: string, init: RequestInit, options?: {emptyOnNotFound?: boolean}): Promise<T | null> {
        const res = await this.cosmosFetch(path, init, options)
        if (!res) return null
        if (res.status === 204) return null
        return await res.json() as T
    }

    private async fetchWithFallbacks(path: string, init: RequestInit, options?: {emptyOnNotFound?: boolean}): Promise<Response | null> {
        const attempts = [
            path,
            `${cosmosAccountPath(this.client)}${path}`,
            `${cosmosNoSqlAccountPath(this.client)}${path}`,
        ]
        const failures: string[] = []

        for (const attempt of attempts) {
            try {
                return await this.client.fetch(attempt, init, options)
            } catch (error) {
                if (!isRetriableRoutingError(error)) throw error
                failures.push(`${attempt}: ${errorMessage(error)}`)
            }
        }

        throw new Error(`Cosmos NoSQL request failed on all known routes. ${failures.join(' | ')}`)
    }
}

function cosmosAccountPath(client: AzureRuntimeClient): string {
    return `/${encodeSegment(`${client.accountName}-cosmos`)}`
}

function cosmosNoSqlAccountPath(client: AzureRuntimeClient): string {
    return `/${encodeSegment(`${client.accountName}-cosmos-nosql`)}`
}

function toDatabaseResource(database: CosmosRecord): CloudResource {
    const name = stringValue(database.id)
    return {
        id: name,
        name,
        cloud: 'azure',
        service: 'database',
        type: 'cosmos-database',
        region: null,
        createdAt: timestampToIso(database._ts),
        status: 'available',
        engine: 'cosmos-nosql',
        version: 'NoSQL API',
        instanceClass: null,
        metadata: {
            provider: 'azure',
            databaseService: 'cosmos',
            api: 'nosql',
            resourceId: database._rid,
            self: database._self,
            etag: unquote(stringValue(database._etag)),
        },
    }
}

function toContainer(databaseId: string, container: CosmosRecord): CosmosContainer {
    return {
        id: stringValue(container.id),
        name: stringValue(container.id),
        databaseId,
        partitionKeyPath: partitionKeyPath(container),
        createdAt: timestampToIso(container._ts),
        metadata: {
            provider: 'azure',
            databaseService: 'cosmos',
            api: 'nosql',
            resourceId: container._rid,
            self: container._self,
            etag: unquote(stringValue(container._etag)),
            indexingPolicy: container.indexingPolicy,
        },
    }
}

function toItem(databaseId: string, containerId: string, document: CosmosRecord): CosmosItem {
    return {
        id: stringValue(document.id),
        databaseId,
        containerId,
        partitionKey: null,
        etag: unquote(stringValue(document._etag)),
        timestamp: timestampToIso(document._ts),
        document,
    }
}

function partitionKeyPath(container: CosmosRecord): string {
    const pk = container.partitionKey
    if (!isRecord(pk) || !Array.isArray(pk.paths) || typeof pk.paths[0] !== 'string') return '/id'
    return pk.paths[0]
}

function filterBySearch(resources: CloudResource[], search?: string): CloudResource[] {
    const normalized = search?.trim().toLowerCase()
    if (!normalized) return resources
    return resources.filter((resource) => resource.name.toLowerCase().includes(normalized))
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value)
}

function timestampToIso(value: unknown): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    return new Date(value * 1000).toISOString()
}

function normalizePartitionKeyPath(value: string): string {
    const trimmed = value.trim() || '/id'
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function isValidCosmosId(value: string): boolean {
    return value.length > 0 && value.length <= 255 && /^[A-Za-z0-9._-]+$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unquote(value: string): string | null {
    if (!value) return null
    return value.replace(/^"|"$/g, '')
}

function encodeSegment(value: string): string {
    return encodeURIComponent(value)
}

function isRetriableRoutingError(error: unknown): boolean {
    return error instanceof Error && (error.message.includes('HTTP 404') || error.message.includes('HTTP 501'))
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
