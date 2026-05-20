import {CloudAdapterRegistry} from './registry/CloudAdapterRegistry'
import {AwsDatabaseAdapter} from './adapter-aws/AwsDatabaseAdapter'
import {AwsEksAdapter} from './adapter-aws/AwsEksAdapter'
import {AwsStorageAdapter} from './adapter-aws/AwsStorageAdapter'
import {AzureStorageAdapter} from './adapter-azure/AzureStorageAdapter'
import {CloudProxyService} from './service/CloudProxyService'

export function createCloudProxyService(): CloudProxyService {
    const registry = new CloudAdapterRegistry([
        new AwsStorageAdapter(),
        new AwsEksAdapter(),
        new AwsDatabaseAdapter(),
        new AzureStorageAdapter(),
    ])

    return new CloudProxyService(registry)
}
