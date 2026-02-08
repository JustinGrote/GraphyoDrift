import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'
import { type AccessTokenProvider, AllowedHostsValidator, BaseBearerTokenAuthenticationProvider} from "@microsoft/kiota-abstractions";

/** Gets access tokens using MSAL browser library. */
export class MsalAuthenticationProvider extends BaseBearerTokenAuthenticationProvider implements AccessTokenProvider {
  constructor(msalInstance: IPublicClientApplication, scopes?: string[], account?: AccountInfo) {
    super(new MsalAccessTokenProvider(msalInstance, scopes, account))
  }

  getAuthorizationToken = this.accessTokenProvider.getAuthorizationToken
  getAllowedHostsValidator = this.accessTokenProvider.getAllowedHostsValidator
}

/** This provides access tokens based on an MSAL instance. NOTE: Throws exception if not logged in first */
class MsalAccessTokenProvider implements AccessTokenProvider {
  private scopes: string[]
  private msalInstance: IPublicClientApplication
  private account: AccountInfo | undefined

  constructor(msalInstance: IPublicClientApplication, scopes?: string[], account?: AccountInfo) {
    this.scopes = scopes ?? []
    this.msalInstance = msalInstance
    this.account = account ?? msalInstance.getActiveAccount() ?? undefined
  }

  async getAuthorizationToken(
    _url?: string,
    _additionalAuthenticationContext?: Record<string, unknown>,
  ): Promise<string> {
    await this.msalInstance.initialize()

    const result = await this.msalInstance.acquireTokenSilent({
      scopes: this.scopes,
      account: this.account,
    })

    return result.accessToken
  }

  getAllowedHostsValidator(): AllowedHostsValidator {
    return new AllowedHostsValidator() // Allow all hosts
  }
}
