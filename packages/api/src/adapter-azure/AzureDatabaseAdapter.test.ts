import {describe, expect, test} from 'bun:test'
import {AzureDatabaseAdapter} from './AzureDatabaseAdapter'
import type {AzureRuntimeClient, AzureRuntimeFetchOptions} from '../azure'

describe('AzureDatabaseAdapter', () => {
    test('normalizes Cosmos databases as cloud database resources', async () => {
        const adapter = new AzureDatabaseAdapter(testClient({
            '/dbs': {
                _count: 1,
                Databases: [{id: 'appdb', _rid: 'db-rid', _etag: '"etag"', _ts: 1779307200}],
            },
        }))

        await expect(adapter.list()).resolves.toEqual([{
            id: 'appdb',
            name: 'appdb',
            cloud: 'azure',
            service: 'database',
            type: 'cosmos-database',
            region: null,
            createdAt: '2026-05-20T20:00:00.000Z',
            status: 'available',
            engine: 'cosmos-nosql',
            version: 'NoSQL API',
            instanceClass: null,
            metadata: {
                provider: 'azure',
                databaseService: 'cosmos',
                api: 'nosql',
                resourceId: 'db-rid',
                self: undefined,
                etag: 'etag',
            },
        }])
    })

    test('lists containers and documents from the selected database', async () => {
        const adapter = new AzureDatabaseAdapter(testClient({
            '/dbs/appdb/colls': {
                _count: 1,
                DocumentCollections: [{
                    id: 'items',
                    _rid: 'coll-rid',
                    _etag: '"coll-etag"',
                    _ts: 1779307200,
                    partitionKey: {paths: ['/category'], kind: 'Hash'},
                }],
            },
            '/dbs/appdb/colls/items/docs': {
                _count: 1,
                Documents: [{id: 'item-1', category: 'demo', _etag: '"doc-etag"', _ts: 1779307201}],
            },
        }))

        await expect(adapter.listCosmosContainers('appdb')).resolves.toMatchObject([{
            id: 'items',
            databaseId: 'appdb',
            partitionKeyPath: '/category',
        }])
        await expect(adapter.listCosmosItems('appdb', 'items')).resolves.toMatchObject([{
            id: 'item-1',
            databaseId: 'appdb',
            containerId: 'items',
            etag: 'doc-etag',
            document: {id: 'item-1', category: 'demo', _etag: '"doc-etag"', _ts: 1779307201},
        }])
    })

    test('queries documents using the Cosmos SQL query endpoint', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureDatabaseAdapter(testClient({
            '/dbs/appdb/colls/items/docs': {
                _count: 1,
                Documents: [{id: 'item-1'}],
            },
        }, calls))

        await expect(adapter.queryCosmosItems('appdb', 'items', 'SELECT * FROM c')).resolves.toEqual({
            count: 1,
            items: [{id: 'item-1'}],
        })
        expect(calls[0].path).toBe('/dbs/appdb/colls/items/docs')
        expect(calls[0].init.method).toBe('POST')
        expect(calls[0].init.headers).toMatchObject({'x-ms-documentdb-isquery': 'True'})
    })

    test('falls back to account-suffixed path when root routing is not implemented', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureDatabaseAdapter(testClient({
            '/dbs': 'not-implemented',
            '/devstoreaccount1-cosmos/dbs': {
                _count: 1,
                Databases: [{id: 'fallbackdb'}],
            },
        }, calls))

        await expect(adapter.list()).resolves.toMatchObject([{id: 'fallbackdb'}])
        expect(calls.map((call) => call.path)).toEqual(['/dbs', '/devstoreaccount1-cosmos/dbs'])
    })

    test('falls back to named NoSQL engine path after root and default account routes fail', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureDatabaseAdapter(testClient({
            '/dbs': 'not-implemented',
            '/devstoreaccount1-cosmos/dbs': 'not-implemented',
            '/devstoreaccount1-cosmos-nosql/dbs': {
                _count: 1,
                Databases: [{id: 'nosqldb'}],
            },
        }, calls))

        await expect(adapter.list()).resolves.toMatchObject([{id: 'nosqldb'}])
        expect(calls.map((call) => call.path)).toEqual([
            '/dbs',
            '/devstoreaccount1-cosmos/dbs',
            '/devstoreaccount1-cosmos-nosql/dbs',
        ])
    })
})

function testClient(responses: Record<string, unknown>, calls: Array<{path: string; init: RequestInit}> = []): AzureRuntimeClient {
    return {
        endpoint: 'http://localhost:4577',
        accountName: 'devstoreaccount1',
        async fetch(path: string, init: RequestInit, options: AzureRuntimeFetchOptions = {}) {
            calls.push({path, init})
            if (responses[path] === 'not-implemented') {
                throw new Error('Azure runtime request failed: HTTP 501')
            }
            if (!(path in responses)) {
                if (options.emptyOnNotFound) return null
                return new Response('Not Found', {status: 404})
            }
            return new Response(JSON.stringify(responses[path]), {status: 200, headers: {'content-type': 'application/json'}})
        },
    }
}
