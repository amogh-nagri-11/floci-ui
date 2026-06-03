import type {CloudProvider, FieldSchema, ServiceSchema, TableColumnSchema} from './types'

const eksColumns: TableColumnSchema[] = [
    {name: 'name', label: 'Name'},
    {name: 'status', label: 'Status'},
    {name: 'version', label: 'Version'},
    {name: 'createdAt', label: 'Created At'},
]

const eksFilters: FieldSchema[] = [
    {name: 'search', label: 'Search', type: 'text', required: false},
]

export function awsEksSchema(): ServiceSchema {
    return {
        cloud: 'aws',
        service: 'k8s',
        displayName: 'AWS EKS',
        fields: [],
        actions: ['list', 'inspect'],
        filters: eksFilters,
        columns: eksColumns,
    }
}

export function azureAksSchema(): ServiceSchema {
    return {
        cloud: 'azure',
        service: 'k8s',
        displayName: 'Azure AKS',
        fields: [],
        actions: ['list', 'inspect'],
        filters: eksFilters,
        columns: eksColumns,
    }
}

export function gcpGkeSchema(): ServiceSchema {
    return {
        cloud: 'gcp',
        service: 'k8s',
        displayName: 'Google GKE',
        fields: [],
        actions: ['list', 'inspect'],
        filters: eksFilters,
        columns: eksColumns,
    }
}

export function k8sSchemaFor(cloud: CloudProvider): ServiceSchema | null {
    if (cloud === 'aws') return awsEksSchema()
    if (cloud === 'azure') return azureAksSchema()
    if (cloud === 'gcp') return gcpGkeSchema()
    return null
}
