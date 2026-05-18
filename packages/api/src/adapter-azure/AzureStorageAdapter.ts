import {azureStorageSchema} from '../cloud-spi/storageSchema'
import type {
    CloudResource,
    CloudServiceAdapter,
    CreateResourceInput,
    ResourceQuery,
    ServiceSchema,
    StorageObjectDownload,
    StorageObjectList,
} from '../cloud-spi/types'

export interface AzureEndpointProperties {
    endpoint: string
}

export class AzureStorageAdapter implements CloudServiceAdapter {
    readonly cloud = 'azure' as const
    readonly service = 'storage' as const

    constructor(private readonly props: AzureEndpointProperties) {}

    schema(): ServiceSchema {
        return azureStorageSchema()
    }

    async list(query: ResourceQuery = {}): Promise<CloudResource[]> {
        const res = await this.azureFetch('/?comp=list', {method: 'GET'}, {emptyOnNotFound: true})
        if (!res) return []

        const xml = await res.text()
        return filterBySearch(parseContainers(xml), query.search)
    }

    async get(id: string): Promise<CloudResource | null> {
        const resources = await this.list()
        return resources.find((resource) => resource.id === id) ?? null
    }

    async create(input: CreateResourceInput): Promise<CloudResource> {
        const containerName = stringValue(input.values.containerName)
        if (!containerName) throw new Error('containerName is required')

        await this.azureFetch(`/${encodeURIComponent(containerName)}?restype=container`, {method: 'PUT'})
        return normalizeContainer(containerName, null)
    }

    async delete(id: string): Promise<void> {
        await this.azureFetch(`/${encodeURIComponent(id)}?restype=container`, {method: 'DELETE'})
    }

    async listObjects(resourceId: string, prefix = ''): Promise<StorageObjectList> {
        const qs = new URLSearchParams({restype: 'container', comp: 'list', delimiter: '/'})
        if (prefix) qs.set('prefix', prefix)
        const res = await this.azureFetch(`/${encodeURIComponent(resourceId)}?${qs}`, {method: 'GET'}, {emptyOnNotFound: true})
        if (!res) return {prefix, objects: []}

        const xml = await res.text()
        return {prefix, objects: parseBlobs(xml, prefix)}
    }

    async putObject(resourceId: string, key: string, body: Uint8Array, contentType: string): Promise<void> {
        await this.azureFetch(`/${encodeURIComponent(resourceId)}/${encodePath(key)}`, {
            method: 'PUT',
            body: copyBytes(body),
            headers: {
                'content-type': contentType,
                'x-ms-blob-type': 'BlockBlob',
            },
        })
    }

    async getObject(resourceId: string, key: string): Promise<StorageObjectDownload> {
        const res = await this.azureFetch(`/${encodeURIComponent(resourceId)}/${encodePath(key)}`, {method: 'GET'})
        if (!res) throw new Error('Azure blob not found')
        return {
            body: await res.arrayBuffer(),
            contentType: res.headers.get('content-type') ?? 'application/octet-stream',
            contentLength: numberHeader(res.headers.get('content-length')),
        }
    }

    async deleteObject(resourceId: string, key: string): Promise<void> {
        await this.azureFetch(`/${encodeURIComponent(resourceId)}/${encodePath(key)}`, {method: 'DELETE'})
    }

    private async azureFetch(path: string, init: RequestInit, options: {emptyOnNotFound?: boolean} = {}): Promise<Response | null> {
        const res = await fetch(`${this.props.endpoint}${path}`, {
            ...init,
            headers: {
                'x-ms-version': '2021-12-02',
                ...(init.headers ?? {}),
            },
        })

        if (options.emptyOnNotFound && res.status === 404) return null

        if (!res.ok) {
            throw new Error(`Azure Blob request failed: HTTP ${res.status}`)
        }

        return res
    }
}

function parseContainers(xml: string): CloudResource[] {
    const matches = xml.matchAll(/<Container>\s*<Name>([^<]+)<\/Name>[\s\S]*?(?:<Last-Modified>([^<]+)<\/Last-Modified>)?[\s\S]*?<\/Container>/g)
    return [...matches].map((match) => normalizeContainer(decodeXml(match[1]), match[2] ? decodeXml(match[2]) : null))
}

function parseBlobs(xml: string, prefix: string) {
    const prefixes = [...xml.matchAll(/<BlobPrefix>\s*<Name>([^<]+)<\/Name>\s*<\/BlobPrefix>/g)].map((match) => {
        const key = decodeXml(match[1])
        return {
            key,
            name: objectName(key, prefix),
            type: 'folder' as const,
            size: null,
            lastModified: null,
            metadata: {},
        }
    })

    const blobs = [...xml.matchAll(/<Blob>\s*<Name>([^<]+)<\/Name>[\s\S]*?(?:<Last-Modified>([^<]+)<\/Last-Modified>)?[\s\S]*?(?:<Content-Length>([^<]+)<\/Content-Length>)?[\s\S]*?<\/Blob>/g)].map((match) => {
        const key = decodeXml(match[1])
        return {
            key,
            name: objectName(key, prefix),
            type: 'object' as const,
            size: match[3] ? Number(match[3]) : null,
            lastModified: match[2] ? decodeXml(match[2]) : null,
            metadata: {},
        }
    })

    return [...prefixes, ...blobs]
}

function normalizeContainer(name: string, createdAt: string | null): CloudResource {
    return {
        id: name,
        name,
        cloud: 'azure',
        service: 'storage',
        type: 'container',
        region: null,
        createdAt,
        metadata: {},
    }
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function filterBySearch(resources: CloudResource[], search?: string): CloudResource[] {
    const normalized = search?.trim().toLowerCase()
    if (!normalized) return resources
    return resources.filter((resource) => resource.name.toLowerCase().includes(normalized))
}

function decodeXml(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
}

function objectName(key: string, prefix: string): string {
    const relative = key.startsWith(prefix) ? key.slice(prefix.length) : key
    return relative.replace(/\/$/, '') || key
}

function encodePath(key: string): string {
    return key.split('/').map(encodeURIComponent).join('/')
}

function numberHeader(value: string | null): number | null {
    if (!value) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return copy.buffer
}
