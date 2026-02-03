import {
  type AccountInfo,
  createStandardPublicClientApplication,
  InteractionRequiredAuthError,
  type IPublicClientApplication,
  PublicClientApplication,
} from '@azure/msal-browser'
import {
  type AccessTokenProvider,
  AllowedHostsValidator,
  BaseBearerTokenAuthenticationProvider,
} from '@microsoft/kiota-abstractions'
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary'
import { DeepMap } from 'deep-equality-data-structures'
import { createGraphClient, type GraphClient } from '../../Generated/graphChangeSdk/graphClient'

const configuredClientId =
  (import.meta.env.VITE_AAD_CLIENT_ID as string | undefined) ?? '513dbbf0-2564-4fc0-8b58-d407e30a69d4'
const tenantId = import.meta.env.VITE_AAD_TENANT_ID as string | undefined

const authority = tenantId
  ? `https://login.microsoftonline.com/${tenantId}`
  : 'https://login.microsoftonline.com/common'

const graphDefaultScope = 'https://graph.microsoft.com/.default'
const graphDefaultHosts = ['graph.microsoft.com', 'graph.microsoft.us']

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

/** This is an adapter to the MsalAccessTokenProvider for graph to present it as a bearer toekn */
class GraphMsalAccessTokenProvider extends BaseBearerTokenAuthenticationProvider implements AccessTokenProvider {
  constructor(msalInstance: IPublicClientApplication, scopes: string[], allowedHosts: string[] = graphDefaultHosts) {
    super(new MsalAccessTokenProvider(scopes, allowedHosts, msalInstance))
  }

  getAuthorizationToken = this.accessTokenProvider.getAuthorizationToken
  getAllowedHostsValidator = this.accessTokenProvider.getAllowedHostsValidator
}

/** This provides access tokens based on an MSAL instance. */
class MsalAccessTokenProvider implements AccessTokenProvider {
  private scopes: string[]
  private allowedHosts: Set<string>
  private msalInstance: IPublicClientApplication

  constructor(scopes: string[], allowedHosts: string[] = graphDefaultHosts, msalInstance: IPublicClientApplication) {
    this.scopes = scopes
    this.allowedHosts = new Set(allowedHosts)
    this.msalInstance = msalInstance
  }

  async getAuthorizationToken(
    _url?: string,
    _additionalAuthenticationContext?: Record<string, unknown>,
  ): Promise<string> {
    await this.msalInstance.initialize()

    const result = await this.msalInstance.acquireTokenSilent({
      scopes: this.scopes,
    })
    return result.accessToken
  }

  getAllowedHostsValidator(): AllowedHostsValidator {
    return new AllowedHostsValidator(this.allowedHosts)
  }
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

export async function signIn(scopes: string[] = [graphDefaultScope]) {
  const instance = await getMsalInstanceAsync({
    auth: { clientId: configuredClientId, authority },
  })

  await instance.initialize()

  const result = await instance.loginPopup({
    scopes: scopes,
  })

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

export async function getGraphClient(scopes: string[] = [graphDefaultScope]): Promise<GraphClient> {
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

  const newClient = createGraphClient(new FetchRequestAdapter(new GraphMsalAccessTokenProvider(msalInstance, scopes)))

  graphClientCache.set(msalInstance, newClient)
  graphClientInstanceMap.set(account, newClient)
  accountInstanceMap.set(account, msalInstance)
  return newClient
}
