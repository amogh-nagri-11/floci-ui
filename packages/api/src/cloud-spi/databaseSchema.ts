import type {CloudProvider, FieldSchema, ServiceSchema, TableColumnSchema} from './types'

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
        displayName: 'AWS RDS',
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
        displayName: 'Azure SQL Database',
        fields: [],
        actions: ['list', 'inspect'],
        filters: databaseFilters,
        columns: databaseColumns,
    }
}

export function gcpDatabaseSchema(): ServiceSchema {
    return {
        cloud: 'gcp',
        service: 'database',
        displayName: 'Cloud SQL',
        fields: [],
        actions: ['list', 'inspect'],
        filters: databaseFilters,
        columns: databaseColumns,
    }
}

export function databaseSchemaFor(cloud: CloudProvider): ServiceSchema | null {
    if (cloud === 'aws') return awsDatabaseSchema()
    if (cloud === 'azure') return azureDatabaseSchema()
    if (cloud === 'gcp') return gcpDatabaseSchema()
    return null
}
