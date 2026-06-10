import type {FieldSchema, ServiceSchema, TableColumnSchema} from './types'

const databaseColumns: TableColumnSchema[] = [
    {name: 'name', label: 'Name'},
    {name: 'status', label: 'Status'},
    {name: 'engine', label: 'Engine'},
    {name: 'version', label: 'Version'},
    {name: 'instanceClass', label: 'Class'},
]

const databaseFilters: FieldSchema[] = [
    {name: 'search', label: 'Search', type: 'text', required: false},
]

export function awsDatabaseSchema(): ServiceSchema {
    return {
        cloud: 'aws',
        service: 'database',
        displayName: 'Database',
        fields: [],
        actions: ['list', 'inspect'],
        filters: databaseFilters,
        columns: databaseColumns,
    }
}

export function azureDatabaseSchema(): ServiceSchema {
    return {
        cloud: 'azure',
        service: 'database',
        displayName: 'Cosmos DB',
        fields: [
            {
                name: 'databaseName',
                label: 'Database Name',
                type: 'text',
                required: true,
                validation: {
                    minLength: 1,
                    maxLength: 255,
                    pattern: '^[A-Za-z0-9._-]+$',
                    message: 'Use letters, numbers, dot, underscore, or dash.',
                },
            },
        ],
        actions: ['list', 'create', 'delete', 'inspect'],
        capabilities: {
            resourceActions: [
                {name: 'list', label: 'List databases', enabled: true, status: 'available', runtimeRequired: true},
                {name: 'create', label: 'Create database', enabled: true, status: 'available', runtimeRequired: true},
                {name: 'delete', label: 'Delete database', enabled: true, status: 'available', runtimeRequired: true},
                {name: 'inspect', label: 'Inspect metadata', enabled: true, status: 'available', runtimeRequired: true},
            ],
        },
        filters: databaseFilters,
        columns: [
            {name: 'name', label: 'Database'},
            {name: 'engine', label: 'Engine'},
            {name: 'status', label: 'Status'},
            {name: 'createdAt', label: 'Created At'},
        ],
    }
}
