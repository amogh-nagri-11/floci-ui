import type {FieldSchema, ServiceSchema, TableColumnSchema} from './types'

const computeColumns: TableColumnSchema[] = [
    {name: 'name', label: 'Name'},
    {name: 'type', label: 'Type'},
    {name: 'status', label: 'State'},
    {name: 'region', label: 'AZ'},
    {name: 'createdAt', label: 'Created'},
]

const computeFilters: FieldSchema[] = [
    {name: 'search', label: 'Search', type: 'text', required: false},
]

export function awsComputeSchema(): ServiceSchema {
    return {
        cloud: 'aws',
        service: 'compute',
        displayName: 'Compute',
        fields: [],
        actions: ['list', 'inspect'],
        filters: computeFilters,
        columns: computeColumns,
    }
}
