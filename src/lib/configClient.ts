import { getGraphClient } from './graphClient'

export async function getSnapshotJobs() {
  const client = await getGraphClient()
  const response = await client.admin.configurationManagement.configurationSnapshotJobs.get({
    queryParameters: {
      top: 25,
      orderby: ['createdDateTime desc'],
    },
  })
  return response?.value ?? []
}

export async function createConfigurationSnapshot() {
  const client = await getGraphClient()
  const currentDateTime = new Date().toISOString().replace(/[^\w]/g, '')
  // 32 character limit on display name, only discoverable via a runtime error
  const displayName = `GraphyoDrift ${currentDateTime}`.substring(0, 32)
  const snapshotJob = {
    displayName,
    description: 'Snapshot of Conditional Access Policies for drift detection',
    resources: ['microsoft.entra.conditionalaccesspolicy'],
  }

  // HACK: Fix when openapi has this endpoint available
  const snapshotCreateEndpoint = client.admin.configurationManagement.configurationSnapshotJobs.withUrl(
    'https://graph.microsoft.com/beta/admin/configurationManagement/configurationSnapshots/createSnapshot',
  )

  const response = await snapshotCreateEndpoint.post(snapshotJob)
  if (!response) {
    throw new Error('Failed to create configuration snapshot')
  }
  return response
}