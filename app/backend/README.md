```
npm install
npm run dev
```

```
open http://localhost:3000
```

## SSO (OpenID Connect)

Generic OIDC providers (Authentik, Keycloak, Google, etc.) can be used for login.
Set the following environment variables:

| Variable | Description |
| --- | --- |
| `OIDC_ENABLED` | `true` to enable SSO login |
| `OIDC_ISSUER_URL` | Issuer base URL (discovery document is fetched from `/.well-known/openid-configuration`) |
| `OIDC_CLIENT_ID` | Client ID registered at the provider |
| `OIDC_CLIENT_SECRET` | Client secret (omit for public/PKCE-only clients) |
| `OIDC_REDIRECT_URI` | `https://<api-host>/api/v4/auth/sso/callback` (must be registered at the provider) |
| `OIDC_SCOPE` | Requested scopes (default: `openid profile email`) |
| `OIDC_DISPLAY_NAME` | Label of the frontend login button (default: `SSO`) |
| `OIDC_AUTO_PROVISION` | `true` (default) creates a local user on first SSO login |
| `OIDC_ALLOW_HTTP` | `true` allows plain-HTTP issuers (local development only; never enable in production) |
| `FRONTEND_URL` | Frontend base URL used for the post-login redirect |

SSO identities are linked to `User.externalId` as `<issuer>#<sub>`.
The flow uses the authorization code grant with PKCE, state, and nonce.

### SSO-only mode

Set `PASSWORD_AUTH_ENABLED=false` to disable username/password login and
password-based signup. The frontend then shows only the SSO login button.
`PASSWORD_AUTH_ENABLED` defaults to `true` for backward compatibility.
At least one authentication method must stay enabled.
