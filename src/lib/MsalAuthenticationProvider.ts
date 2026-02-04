import type { IPublicClientApplication } from "@azure/msal-browser";
import { type AccessTokenProvider, AllowedHostsValidator, BaseBearerTokenAuthenticationProvider} from "@microsoft/kiota-abstractions";


/** Gets access tokens using MSAL browser library. */
export class MsalAuthenticationProvider extends BaseBearerTokenAuthenticationProvider implements AccessTokenProvider {
  constructor(msalInstance: IPublicClientApplication, scopes: string[]) {
    super(new MsalAccessTokenProvider(scopes, msalInstance))
  }

  getAuthorizationToken = this.accessTokenProvider.getAuthorizationToken
  getAllowedHostsValidator = this.accessTokenProvider.getAllowedHostsValidator
}

/** An authentication provider for Microsoft Graph using MSAL. Fetches the .default scope if not provided. */
export class GraphMsalAuthenticationProvider extends MsalAuthenticationProvider {
	constructor(msalInstance: IPublicClientApplication, scopes: string[] = ['https://graph.microsoft.com/.default']) {
		super(msalInstance, scopes)
	}
}

/** This provides access tokens based on an MSAL instance. NOTE: Throws exception if not logged in first */
class MsalAccessTokenProvider implements AccessTokenProvider {
  private scopes: string[]
  private msalInstance: IPublicClientApplication

  constructor(scopes: string[], msalInstance: IPublicClientApplication) {
    this.scopes = scopes
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
    return new AllowedHostsValidator() // Allow all hosts
  }
}
