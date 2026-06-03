import {CloudAdapterRegistry} from './registry/CloudAdapterRegistry'
import {AwsComputeAdapter} from './adapter-aws/AwsComputeAdapter'
import {AwsNetworkingAdapter} from './adapter-aws/AwsNetworkingAdapter'
import {AwsDatabaseAdapter} from './adapter-aws/AwsDatabaseAdapter'
import {AwsEksAdapter} from './adapter-aws/AwsEksAdapter'
import {AwsStorageAdapter} from './adapter-aws/AwsStorageAdapter'
import {AzureStorageAdapter} from './adapter-azure/AzureStorageAdapter'
import {GcpStorageAdapter} from './adapter-gcp/GcpStorageAdapter'
import {CloudProxyService} from './service/CloudProxyService'

export function createCloudProxyService(): CloudProxyService {
    const registry = new CloudAdapterRegistry([
        new AwsStorageAdapter(),
        new AwsEksAdapter(),
        new AwsDatabaseAdapter(),
        new AwsComputeAdapter(),
        new AwsNetworkingAdapter(),
        new AzureStorageAdapter(),
        new GcpStorageAdapter(),
    ])

    return new CloudProxyService(registry)
}
