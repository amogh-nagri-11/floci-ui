import type {CloudProvider, FieldSchema, ServiceSchema, TableColumnSchema} from './types'

const serverlessColumns: TableColumnSchema[] = [
    {name: 'name', label: 'Function Name'},
    {name: 'type', label: 'Type'},
    {name: 'cloud', label: 'Cloud'},
    {name: 'region', label: 'Region'},
    {name: 'runtime', label: 'Runtime'},
    {name: 'status', label: 'Status'},
    {name: 'updatedAt', label: 'Last Updated'},
]

const serverlessFilters: FieldSchema[] = [
    {name: 'search', label: 'Search', type: 'text', required: false},
    {name: 'runtime', label: 'Runtime', type: 'text', required: false},
]

export function awsServerlessSchema(): ServiceSchema {
    return {
        cloud: 'aws',
        service: 'serverless',
        displayName: 'AWS Lambda',
        fields: [],
        actions: ['list', 'inspect'],
        filters: serverlessFilters,
        columns: serverlessColumns,
    }
}

export function azureServerlessSchema(): ServiceSchema {
    return {
        cloud: 'azure',
        service: 'serverless',
        displayName: 'Azure Functions',
        fields: [],
        actions: ['list', 'inspect'],
        filters: serverlessFilters,
        columns: serverlessColumns,
    }
}

export function gcpServerlessSchema(): ServiceSchema {
    return {
        cloud: 'gcp',
        service: 'serverless',
        displayName: 'Cloud Functions',
        fields: [],
        actions: ['list', 'inspect'],
        filters: serverlessFilters,
        columns: serverlessColumns,
    }
}

export function serverlessSchemaFor(cloud: CloudProvider): ServiceSchema | null {
    if (cloud === 'aws') return awsServerlessSchema()
    if (cloud === 'azure') return azureServerlessSchema()
    if (cloud === 'gcp') return gcpServerlessSchema()
    return null
}
