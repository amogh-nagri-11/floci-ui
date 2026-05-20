import type {CloudProvider, FieldSchema, ServiceSchema, TableColumnSchema} from './types'

const storageColumns: TableColumnSchema[] = [
    {name: 'name', label: 'Name'},
    {name: 'type', label: 'Type'},
    {name: 'cloud', label: 'Cloud'},
    {name: 'region', label: 'Region'},
    {name: 'createdAt', label: 'Created At'},
]

const storageFilters: FieldSchema[] = [
    {name: 'search', label: 'Search', type: 'text', required: false},
]

export function awsStorageSchema(): ServiceSchema {
    return {
        cloud: 'aws',
        service: 'storage',
        displayName: 'S3 Storage',
        fields: [
            {
                name: 'bucketName',
                label: 'Bucket Name',
                type: 'text',
                required: true,
                description: '3-63 characters. Lowercase letters, numbers, dots, and hyphens.',
                validation: {
                    pattern: '^(?!\\d+\\.\\d+\\.\\d+\\.\\d+$)(?!.*\\.\\.)(?!.*\\.-)(?!.*-\\.)(?!.*--x-s3$)(?!.*-s3alias$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$',
                    minLength: 3,
                    maxLength: 63,
                    message: 'Use a valid S3 bucket name: 3-63 lowercase characters, numbers, dots, or hyphens.',
                },
            },
            {
                name: 'region',
                label: 'Region',
                type: 'select',
                required: false,
                options: [
                    {label: 'US East (N. Virginia)', value: 'us-east-1'},
                    {label: 'US West (Oregon)', value: 'us-west-2'},
                ],
            },
        ],
        actions: ['list', 'create', 'delete', 'inspect'],
        capabilities: {
            resourceActions: ['list', 'create', 'delete', 'inspect'],
            objectActions: ['list', 'upload', 'download', 'delete', 'createFolder'],
        },
        filters: storageFilters,
        columns: storageColumns,
    }
}

export function azureStorageSchema(): ServiceSchema {
    return {
        cloud: 'azure',
        service: 'storage',
        displayName: 'Azure Blob Storage',
        fields: [
            {
                name: 'containerName',
                label: 'Container Name',
                type: 'text',
                required: true,
                description: '3-63 characters. Lowercase letters, numbers, and hyphens.',
                validation: {
                    pattern: '^[a-z0-9](?:[a-z0-9]|-(?!-)){1,61}[a-z0-9]$',
                    minLength: 3,
                    maxLength: 63,
                    message: 'Use a valid Azure container name: 3-63 lowercase letters, numbers, or single hyphens.',
                },
            },
        ],
        actions: ['list', 'create', 'delete', 'inspect'],
        capabilities: {
            resourceActions: ['list', 'create', 'delete', 'inspect'],
            objectActions: ['list', 'upload', 'download', 'delete', 'createFolder'],
        },
        filters: storageFilters,
        columns: storageColumns,
    }
}

export function storageSchemaFor(cloud: CloudProvider): ServiceSchema | null {
    if (cloud === 'aws') return awsStorageSchema()
    if (cloud === 'azure') return azureStorageSchema()
    return null
}
