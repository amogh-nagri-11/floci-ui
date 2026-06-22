export function gcpEndpoint(): string {
    return process.env.FLOCI_GCP_ENDPOINT ?? process.env.FLOCI_GP_ENDPOINT ?? 'http://localhost:4588'
}

export function gcpProject(): string {
    return process.env.FLOCI_GCP_PROJECT ?? 'floci-local'
}

export function gcpLocation(): string {
    return process.env.FLOCI_GCP_LOCATION ?? 'us-central1'
}

export async function checkGcpRuntime(endpoint: string = gcpEndpoint()): Promise<void> {
    try {
        await globalThis.fetch(endpoint, {method: 'GET'})
    } catch (error) {
        throw new Error(`Cannot reach Floci-GCP at ${endpoint}: ${errorMessage(error)}`)
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
