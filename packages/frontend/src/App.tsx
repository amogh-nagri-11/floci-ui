import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom'
import {Layout} from '@/components/Layout'
import {ServicePage} from '@/features/service/ServicePage'
import {CloudWatchPage} from '@/features/cloudwatch/CloudWatchPage'
import {S3Page} from '@/features/s3/S3Page'
import {SQSPage} from '@/features/sqs/SQSPage'
import {DynamoDBPage} from '@/features/dynamodb/DynamoDBPage'
import {LambdaPage} from '@/features/lambda/LambdaPage'
import {SNSPage} from '@/features/sns/SNSPage'
import {SecretsManagerPage} from '@/features/secretsmanager/SecretsManagerPage'
import {CloudExplorerPage} from '@/pages/CloudExplorerPage'
import {CloudConsoleHomePage} from '@/pages/CloudConsoleHomePage'
import {EKSPage} from '@/features/eks/EKSPage'
import {RDSPage} from '@/features/rds/RDSPage'

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<Layout/>}>
                    <Route index element={<Navigate to="/console/aws" replace/>}/>
                    <Route path="/dashboard" element={<Navigate to="/console/aws" replace/>}/>
                    <Route path="/console" element={<Navigate to="/console/aws" replace/>}/>
                    <Route path="/console/:cloud" element={<CloudConsoleHomePage/>}/>
                    <Route path="/cloud-explorer" element={<Navigate to="/cloud-explorer/aws/storage" replace/>}/>
                    <Route path="/cloud-explorer/:cloud/:service" element={<CloudExplorerPage/>}/>
                    <Route path="/cloudwatch" element={<CloudWatchPage/>}/>
                    <Route path="/s3" element={<S3Page/>}/>
                    <Route path="/sqs" element={<SQSPage/>}/>
                    <Route path="/lambda" element={<LambdaPage/>}/>
                    <Route path="/eks" element={<EKSPage/>}/>
                    <Route path="/rds" element={<RDSPage/>}/>
                    <Route path="/dynamodb" element={<DynamoDBPage/>}/>
                    <Route path="/sns" element={<SNSPage/>}/>
                    <Route path="/secretsmanager" element={<SecretsManagerPage/>}/>
                    <Route path="/:service" element={<ServicePage/>}/>
                    <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
                </Route>
            </Routes>
        </BrowserRouter>
    )
}
