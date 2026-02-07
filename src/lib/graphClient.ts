import {
  type AccountInfo,
  createStandardPublicClientApplication,
  InteractionRequiredAuthError,
  type IPublicClientApplication,
  type PublicClientApplication,
} from '@azure/msal-browser'
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary'
import { DeepMap } from 'deep-equality-data-structures'
import {
  createGraphClient,
  type GraphClient,
} from '../../Generated/graphChangeSdk/graphClient'
import { GraphMsalAuthenticationProvider } from './MsalAuthenticationProvider'

// Configuration Options
/** The client ID for the Entra Application to use */
const configuredClientId = (import.meta.env.VITE_AAD_CLIENT_ID as string | undefined) ?? '513dbbf0-2564-4fc0-8b58-d407e30a69d4'
/** The tenant ID hint for login, to lock access to a specific tenant and for B2B logins to work */
const tenantId = import.meta.env.VITE_AAD_TENANT_ID as string | undefined

/** The default MSAL instance, global to the app per best practices. Only changes when Client ID is reconfigured */
let instance: IPublicClientApplication | undefined
/** Track the client Id used to create the default instance since it is not exposed */
let defaultInstanceClientId: string | undefined

/** Scopes for the app. TODO: dynamic scopes for readonly, single-tenant, and multitenant */
const defaultScopes = ['ConfigurationMonitoring.ReadWrite.All', 'https://management.azure.com/user_impersonation']

/** Sets the client ID for the function. Note that doing this will require a new sign-in if not signed in to that particular client yet */
type MsalConfig = ConstructorParameters<typeof PublicClientApplication>[0]
const msalInstanceCache: DeepMap<MsalConfig, IPublicClientApplication> = new DeepMap()

// Sets the client ID for the MSAL instance (or undefined if not cached). A new sign-in will be required if not already performed.
export function setClientId(clientId: string = configuredClientId) {
  instance = msalInstanceCache.get({
    auth: {
      clientId,
    },
  })
}

const authority = tenantId
  ? `https://login.microsoftonline.com/${tenantId}`
  : 'https://login.microsoftonline.com/common'

const graphClientCache: Map<IPublicClientApplication, GraphClient> = new Map()
const accountInstanceMap: DeepMap<AccountInfo, IPublicClientApplication> = new DeepMap()
const graphClientInstanceMap: DeepMap<AccountInfo, GraphClient> = new DeepMap()

/** Fetches a singleton MSAL instance for a given config, per MSAL best practice */
async function getMsalInstance(config: MsalConfig = {auth: { clientId: configuredClientId, authority }}): Promise<IPublicClientApplication> {
  const cached = msalInstanceCache.get(config)
  if (cached) return cached

  const instance = await createStandardPublicClientApplication(config)
  // BUG: Seems to be needed in MSAL LTS. This should not be necessary, might be fixed in future versions
  await instance.initialize()

  msalInstanceCache.set(config, instance)
  return instance
}

/** Represents a Microsoft Azure tenant */
type Tenant = {
  /** Country/region name of the address for the tenant */
  country: string
  /** Country/region abbreviation for the tenant */
  countryCode: string
  /** The default domain for the tenant */
  defaultDomain: string
  /** The display name of the tenant */
  displayName: string
  /** The list of domains for the tenant */
  domains: string[]
  /** The fully qualified ID of the tenant (e.g., /tenants/8d65815f-a5b6-402f-9298-045155da7d74) */
  id: string
  /** The tenant's branding logo URL. Only available for 'Home' tenant category */
  tenantBrandingLogoUrl: string
  /** Category of the tenant */
  tenantCategory: string
  /** The tenant ID (e.g., 8d65815f-a5b6-402f-9298-045155da7d74) */
  tenantId: string
  /** The tenant type. Only available for 'Home' tenant category */
  tenantType: string
}
type TenantId = string

export async function getTenants(account: AccountInfo): Promise<Record<TenantId, Tenant>> {
  const instance = await getMsalInstance()
  let tokenResponse: { accessToken: string }

  try {
    tokenResponse = await instance.acquireTokenSilent({ scopes: defaultScopes, account })
  } catch (err) {
    if (!(err instanceof InteractionRequiredAuthError)) throw err
    tokenResponse = await instance.acquireTokenPopup({ scopes: defaultScopes, account })
  }
  const response = await fetch('https://management.azure.com/tenants?api-version=2022-12-01', {
    headers: {
      Authorization: `Bearer ${tokenResponse.accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch tenants: ${response.statusText}`)
  }

  const data = await response.json()
  const tenants = data.value satisfies Tenant[]
  return tenants
}

export async function signIn(scopes = defaultScopes) {
  instance = await getMsalInstance({
    auth: { clientId: configuredClientId, authority },
  })

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

export async function getSnapshotJobs() {
  const client = await getGraphClient()
  const response = await client.admin.configurationManagement.configurationSnapshotJobs.get({
    queryParameters: {
      top: 25,
      orderby: ['createdDateTime desc'],
    },
  })
}

export async function signOut() {
  const instance = await getMsalInstance({
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

export async function getGraphClient(scopes = defaultScopes): Promise<GraphClient> {
  const msalInstance = await getMsalInstance()
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

// Parse and convert Graph Errors into regular Error objects for browser processing purposes.
export function parseGraphErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return `A non-error object was received, this is a bug: ${JSON.stringify(error)}`
  }

  return error.message
}