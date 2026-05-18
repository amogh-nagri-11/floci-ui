import {afterEach, describe, expect, test} from 'bun:test'
import {AzureStorageAdapter} from './AzureStorageAdapter'

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('AzureStorageAdapter', () => {
    test('normalizes missing container list endpoint to an empty list', async () => {
        globalThis.fetch = (async () => new Response('Not Found', {status: 404})) as unknown as typeof fetch

        const adapter = new AzureStorageAdapter({endpoint: 'http://localhost:4577'})
        await expect(adapter.list()).resolves.toEqual([])
    })

    test('normalizes missing blob list endpoint to an empty list', async () => {
        globalThis.fetch = (async () => new Response('Not Found', {status: 404})) as unknown as typeof fetch

        const adapter = new AzureStorageAdapter({endpoint: 'http://localhost:4577'})
        await expect(adapter.listObjects('container')).resolves.toEqual({prefix: '', objects: []})
    })
})
