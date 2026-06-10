import {CloudAdapterRegistry} from './registry/CloudAdapterRegistry'
import {AwsComputeAdapter} from './adapter-aws/AwsComputeAdapter'
import {AwsNetworkingAdapter} from './adapter-aws/AwsNetworkingAdapter'
import {AwsDatabaseAdapter} from './adapter-aws/AwsDatabaseAdapter'
import {AwsEksAdapter} from './adapter-aws/AwsEksAdapter'
import {AwsStorageAdapter} from './adapter-aws/AwsStorageAdapter'
import {AzureDatabaseAdapter} from './adapter-azure/AzureDatabaseAdapter'
import {AzureStorageAdapter} from './adapter-azure/AzureStorageAdapter'
import {CloudProxyService} from './service/CloudProxyService'

export function createCloudProxyService(): CloudProxyService {
    const registry = new CloudAdapterRegistry([
        new AwsStorageAdapter(),
        new AwsEksAdapter(),
        new AwsDatabaseAdapter(),
        new AwsComputeAdapter(),
        new AwsNetworkingAdapter(),
        new AzureStorageAdapter(),
        new AzureDatabaseAdapter(),
    ])

    return new CloudProxyService(registry)
}
