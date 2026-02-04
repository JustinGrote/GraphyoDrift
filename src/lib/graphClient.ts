import {
  type AccountInfo,
  createStandardPublicClientApplication,
  InteractionRequiredAuthError,
  type IPublicClientApplication,
  PublicClientApplication,
} from '@azure/msal-browser'
import {
  createGraphClient,
  type GraphClient,
} from '../../Generated/graphChangeSdk/graphClient'
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary'
import { DeepMap } from 'deep-equality-data-structures'
import { GraphMsalAuthenticationProvider } from './MsalAuthenticationProvider'

const configuredClientId =
  (import.meta.env.VITE_AAD_CLIENT_ID as string | undefined) ?? '513dbbf0-2564-4fc0-8b58-d407e30a69d4'
const tenantId = import.meta.env.VITE_AAD_TENANT_ID as string | undefined

const authority = tenantId
  ? `https://login.microsoftonline.com/${tenantId}`
  : 'https://login.microsoftonline.com/common'

type MsalConfig = ConstructorParameters<typeof PublicClientApplication>[0]

// Singleton MSAL instance and account management
const msalInstanceCache: DeepMap<MsalConfig, IPublicClientApplication> = new DeepMap()
const graphClientCache: Map<IPublicClientApplication, GraphClient> = new Map()
const accountInstanceMap: DeepMap<AccountInfo, IPublicClientApplication> = new DeepMap()
const graphClientInstanceMap: DeepMap<AccountInfo, GraphClient> = new DeepMap()

/** Fetch a singleton Msal Instance based on the configuration */

/** Fetch a Msal instance. Used for dependency injection. Note it will need to be initialized */
function getMsalInstance(config: MsalConfig): IPublicClientApplication {
  const cached = msalInstanceCache.get(config)
  if (cached) return cached
  const instance = new PublicClientApplication(config)
  msalInstanceCache.set(config, instance)
  return instance
}

async function getMsalInstanceAsync(config: MsalConfig): Promise<IPublicClientApplication> {
  const cached = msalInstanceCache.get(config)
  if (cached) return cached
  // This will initialize and cache the instance
  const instance = await createStandardPublicClientApplication(config)
  await instance.initialize()
  msalInstanceCache.set(config, instance)
  return instance
}

export function isMsalConfigured(): boolean {
  return !!configuredClientId
}

export function getActiveAccount(): AccountInfo | null {
  const msalInstance = getMsalInstance({
    auth: { clientId: configuredClientId, authority },
  })
  return msalInstance.getActiveAccount()
}

export async function signIn(scopes: string[] = ['ConfigurationMonitoring.ReadWrite.All']) {
  const instance = await getMsalInstanceAsync({
    auth: { clientId: configuredClientId, authority },
  })

  await instance.initialize()
  try {
    const account = instance.getActiveAccount()
    if (!account) throw new InteractionRequiredAuthError('No Active Account, perform Interactive Login')

    return instance.acquireTokenSilent({ scopes, account })
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) {
      throw error
    }
  }

  // If the above fails with Interactive Required, perform a popup login
  const result = await instance.loginPopup({ scopes })

  instance.setActiveAccount(result.account)
  return result
}

export async function signOut() {
  const instance = await getMsalInstanceAsync({
    auth: { clientId: configuredClientId, authority },
  })

  const account = instance.getActiveAccount()

  // Clear caches
  graphClientCache.delete(instance)
  if (account) {
    graphClientInstanceMap.delete(account)
    accountInstanceMap.delete(account)
  }

  // Perform the logout
  await instance.logoutPopup({
    account: account ?? undefined,
  })
}

export async function getGraphClient(scopes?: string[]): Promise<GraphClient> {
  const msalInstance = await getMsalInstanceAsync({
    auth: { clientId: configuredClientId, authority },
  })
  const existing = graphClientCache.get(msalInstance)

  if (existing) return existing

  // TODO: Support multiple accounts
  const account = msalInstance.getActiveAccount()

  // Assumes the account is already signed in
  if (!account) {
    throw new InteractionRequiredAuthError('NotSignedIn', 'You must log in first before using Microsoft Graph client.')
  }

  // This is our custom bridge to MSAL since the docs only support @azure/identity
  const msalAuthProvider = new GraphMsalAuthenticationProvider(msalInstance, scopes)

  const newClient = createGraphClient(new FetchRequestAdapter(msalAuthProvider))

  graphClientCache.set(msalInstance, newClient)
  graphClientInstanceMap.set(account, newClient)
  accountInstanceMap.set(account, msalInstance)
  return newClient
}

export async function createConfigurationSnapshot(scopes: string[] = ['ConfigurationMonitoring.ReadWrite.All']) {
  const client = await getGraphClient(scopes)
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

// Parse and convert Graph Errors into regular Error objects for browser processing purposes.
export function parseGraphErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'A non-error object was received, this is a bug: ' + JSON.stringify(error)
  }

  return error.message
}