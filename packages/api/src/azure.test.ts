import {afterEach, describe, expect, test} from 'bun:test'
import {AzureRestRuntimeClient} from './azure'

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('AzureRestRuntimeClient', () => {
    test('adds endpoint context to network failures', async () => {
        globalThis.fetch = (async () => {
            throw new Error('connection refused')
        }) as unknown as typeof fetch

        const client = new AzureRestRuntimeClient('http://localhost:4577', 'devstoreaccount1')

        await expect(client.fetch('/container?restype=container', {method: 'PUT'})).rejects.toThrow(
            'Cannot reach Floci-AZ at http://localhost:4577: connection refused',
        )
    })
})
