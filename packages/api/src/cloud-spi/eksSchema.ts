import type {FieldSchema, ServiceSchema, TableColumnSchema} from './types'

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
        displayName: 'k8s Engine',
        fields: [],
        actions: ['list', 'inspect'],
        filters: eksFilters,
        columns: eksColumns,
    }
}
