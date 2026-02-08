import {
  type AccountInfo,
  type Configuration,
  createStandardPublicClientApplication,
  InteractionRequiredAuthError,
  type IPublicClientApplication,
} from '@azure/msal-browser'
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary'
import { DeepMap } from 'deep-equality-data-structures'
import { createGraphClient, type GraphClient } from '../Generated/graphChangeSdk/graphClient'
import { MsalAuthenticationProvider } from './MsalAuthenticationProvider'

/** Defines configuration options for the Graph client */
export type GraphClientConfig = {
  account?: AccountInfo
  scopes?: string[]
}

const getAuthority = (tenantId?: string) =>
  tenantId ? `https://login.microsoftonline.com/${tenantId}` : 'https://login.microsoftonline.com/common'
const defaultClientId =
  (import.meta.env.GRAPHYO_CLIENT_ID as string | undefined) ?? '2e0d3a0a-3d31-48fc-a45e-67b79a11361e'
const defaultTenantId = import.meta.env.GRAPHYO_TENANT_ID as string | undefined

/** Scopes for the app. TODO: dynamic scopes for readonly, single-tenant, and multitenant */
const defaultScopes: string[] = ['https://graph.microsoft.com/ConfigurationMonitoring.ReadWrite.All']

const msalInstanceCache: DeepMap<Configuration, IPublicClientApplication> = new DeepMap()

export const isLoggedIn = () => !!msalInstanceCache.get(activeMsalConfig)?.getAllAccounts().length

const graphClientCache: Map<GraphClientConfig, GraphClient> = new Map()
const accountInstanceMap: DeepMap<AccountInfo, IPublicClientApplication> = new DeepMap()
const graphClientInstanceMap: DeepMap<AccountInfo, GraphClient> = new DeepMap()

const defaultMsalConfig: Configuration = {
  auth: { clientId: defaultClientId, authority: getAuthority(defaultTenantId) },
}

let activeMsalConfig = defaultMsalConfig

/** Fetches a singleton MSAL instance for a given config, per MSAL best practice */
async function getMsalInstance(config = activeMsalConfig): Promise<IPublicClientApplication> {
  const cached = msalInstanceCache.get(config)
  if (cached) return cached

  const instance = await createStandardPublicClientApplication(config)
  // BUG: Seems to be needed in MSAL LTS. This should not be necessary, might be fixed in future versions
  await instance.initialize()
  msalInstanceCache.set(config, instance)
  activeMsalConfig = config
  return instance
}

/** Represents a Microsoft Azure tenant in the ARM REST API */
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
  const azureScope = 'https://management.azure.com/user_impersonation'
  const tokenResponse = await instance.acquireTokenSilent({ scopes: [azureScope], account })
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

/** Request a login using the specified scopes.  */
export async function signIn(scopes = defaultScopes, tenantId?: string) {
  const instance = await getMsalInstance()

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
  const result = await instance.loginPopup({ scopes, authority: getAuthority(tenantId) })

  instance.setActiveAccount(result.account)

  return result
}

export async function signOut(account?: AccountInfo, tenantId?: string) {
  const instance = await getMsalInstance()

  const signOutAccount = account ?? instance.getActiveAccount()

  if (!signOutAccount) {
    throw new Error('No account available to sign out')
  }

  // Clear caches
  graphClientInstanceMap.delete(signOutAccount)
  accountInstanceMap.delete(signOutAccount)

  // Perform the logout
  await instance.logoutPopup({
    account: signOutAccount,
    authority: getAuthority(tenantId),
  })
}



export async function getGraphClient(config: GraphClientConfig = {}): Promise<GraphClient> {
  const existing = graphClientCache.get(config)
  if (existing) return existing

  const msalInstance = await getMsalInstance()

  const account = config.account ?? msalInstance.getActiveAccount()

  // Assumes the account is already signed in
  if (!account) {
    throw new InteractionRequiredAuthError('NotSignedIn', 'You must log in first before using Microsoft Graph client.')
  }

  // This is our custom bridge to MSAL since the docs only support @azure/identity
  const msalAuthProvider = new MsalAuthenticationProvider(msalInstance, config.scopes, config.account)
  const newClient = createGraphClient(new FetchRequestAdapter(msalAuthProvider))

  graphClientCache.set(config, newClient)
  graphClientInstanceMap.set(account, newClient)
  return newClient
}

// Parse and convert Graph Errors into regular Error objects for browser processing purposes.
export function parseGraphErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return `A non-error object was received, this is a bug: ${JSON.stringify(error)}`
  }
  return error.message
}