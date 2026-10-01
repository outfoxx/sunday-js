Sunday 🙏 The framework of REST for TypeScript/JavaScript
===

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/outfoxx/sunday-js/ci.yml?branch=main)
![Coverage](https://sonarcloud.io/api/project_badges/measure?project=outfoxx_sunday-js&metric=coverage)
![npm](https://img.shields.io/npm/v/@outfoxx/sunday)

TypeScript/JavaScript framework for generated REST clients.

### [Read the Documentation](https://outfoxx.github.io/sunday)

### [Schema Runtime Guide](./docs/schema-runtime-guide.md)

---

NPM
---

Sunday is delivered as a standard NPM package.

Package Name:

    @outfoxx/sunday

## License

    Copyright 2020 Outfox, Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

## Profiled credentials

Generated request specifications select `SecurityBinding` entries. Register application providers with
one shared `TokenManager` and pass it as `new FetchTransport(baseUrl, {tokenManager})`. Client secrets,
authorization codes, token storage, and interactive login remain application bindings.

`FetchOAuthTokenProvider` exchanges `clientCredentials` and application-authorized `authorizationCode`
grants and rotates refresh tokens. Configure `identity`, `clientId`, and explicit client authentication
(`client_secret_basic`, `client_secret_post`, or public-client `none`). An interactive application supplies
a fresh `grantIdentity` and an `authorization(request, signal)` callback returning
`{code, redirectUri, codeVerifier}` after its S256 PKCE browser flow has verified state, issuer, and redirect
URI. Codes are consumed once even when exchange fails or is canceled. Discovery requires a separately
configured `issuer`; acquisition endpoint overrides cannot change it. Other authentication methods use
an application `TokenProvider`. Token endpoints require HTTPS except for loopback development URLs.

External and static providers implement `configure` and `acquire`, optionally `refresh`. A `TokenSet`
contains `accessToken`, optional `expiresAt` in Unix milliseconds, and optional `refreshToken`. A returned
refresh token replaces the previous one; omission retains it. Expired interactive sessions without refresh
capability and invalid interactive refresh grants require fresh application authorization.

Cache keys include provider/client identity, grant identity, profile, flow, resolved endpoints, scopes,
audience, and resource. Change provider identity with credential configuration and grant identity with
session/grant inputs. The manager defaults to 30 seconds of expiry skew, coalesces concurrent renewal,
and accepts application-owned `TokenStore` storage. Canceling one waiter preserves others; canceling the
last signals acquisition cancellation. Completed token rotation is saved even after callers cancel.

The transport attaches complete AND credential sets and checks them on every execution. Bodyless
GET/HEAD/OPTIONS requests may recover one explicit bearer `invalid_token` challenge; POST, streamed bodies,
and 403 responses are never automatically replayed. Managed credential requests use manual redirect
handling, and query credentials are redacted from response diagnostics. Providers never receive secrets
from generated metadata, and provider failures use safe runtime diagnostics.
