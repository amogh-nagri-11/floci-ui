export type CloudProvider = 'aws' | 'azure' | 'gcp'

export type CloudServiceType = 'storage' | 'k8s' | 'database' | 'serverless' | 'compute' | 'networking'

export type CloudAvailability = 'available' | 'coming_soon'

export interface CloudDescriptor {
    id: CloudProvider
    displayName: string
    availability: CloudAvailability
}

export interface CloudServiceDescriptor {
    cloud: CloudProvider
    service: CloudServiceType
    displayName: string
    availability: CloudAvailability
}

export interface CloudStatus {
    cloud: CloudProvider
    adapterRegistered: boolean
    runtime: 'reachable' | 'unavailable' | 'coming_soon'
    endpoint: string | null
    checkedAt: string
    error: string | null
}

export type FieldType = 'text' | 'select'

export interface FieldSchema {
    name: string
    label: string
    type: FieldType
    required: boolean
    description?: string
    group?: string
    span?: boolean
    validation?: {
        pattern?: string
        minLength?: number
        maxLength?: number
        message?: string
    }
    options?: Array<{label: string; value: string}>
}

export type ActionSchema = 'list' | 'create' | 'delete' | 'inspect'
export type ResourceActionName = 'list' | 'create' | 'delete' | 'inspect'
export type ObjectActionName = 'list' | 'upload' | 'download' | 'delete' | 'createFolder' | 'copy'
export type CapabilityStatus = 'available' | 'blocked' | 'partial' | 'coming_soon'

export interface CapabilitySchema<TAction extends string> {
    name: TAction
    label: string
    enabled: boolean
    status: CapabilityStatus
    reason?: string
    runtimeRequired?: boolean
}

export interface TableColumnSchema {
    name: string
    label: string
}

export interface ServiceSchema {
    cloud: CloudProvider
    service: CloudServiceType
    displayName: string
    fields: FieldSchema[]
    actions: ActionSchema[]
    capabilities?: {
        resourceActions?: CapabilitySchema<ResourceActionName>[]
        objectActions?: CapabilitySchema<ObjectActionName>[]
    }
    filters: FieldSchema[]
    columns: TableColumnSchema[]
}

export interface CloudResource {
    id: string
    name: string
    cloud: CloudProvider
    service: CloudServiceType
    type: 'bucket' | 'container' | 'cluster' | 'db-instance' | 'instance' | 'image' | 'vpc'
    region: string | null
    createdAt: string | null
    status?: string | null
    version?: string | null
    engine?: string | null
    instanceClass?: string | null
    metadata: Record<string, unknown>
}

export interface StorageObject {
    key: string
    name: string
    type: 'folder' | 'object'
    size: number | null
    lastModified: string | null
    metadata: Record<string, unknown>
}

export interface StorageObjectList {
    prefix: string
    objects: StorageObject[]
}

export interface StorageObjectDownload {
    body: BodyInit
    contentType: string
    contentLength: number | null
}

export interface ResourceQuery {
    search?: string
}

export interface CreateResourceInput {
    values: Record<string, unknown>
}

export interface CloudServiceAdapter {
    readonly cloud: CloudProvider
    readonly service: CloudServiceType
    schema(): ServiceSchema
    list(query?: ResourceQuery): Promise<CloudResource[]>
    get(id: string): Promise<CloudResource | null>
    create(input: CreateResourceInput): Promise<CloudResource>
    delete(id: string): Promise<void>
    listObjects?(resourceId: string, prefix?: string): Promise<StorageObjectList>
    putObject?(resourceId: string, key: string, body: Uint8Array, contentType: string): Promise<void>
    getObject?(resourceId: string, key: string): Promise<StorageObjectDownload>
    deleteObject?(resourceId: string, key: string): Promise<void>
    copyObject?(srcResourceId: string, srcKey: string, destKey: string, destResourceId?: string): Promise<void>
}
