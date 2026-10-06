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
configured `issuer`; acquisition endpoint overrides cannot change it. Public authorization-code/PKCE
clients using `authentication: 'none'` accept discovery that omits `none`, including an absent or empty
authentication-method list. Supplied lists must contain only strings. Confidential clients still
require their configured method; an absent list defaults to `client_secret_basic`. Discovery and
endpoint trust are checked again on refresh. Other authentication methods use
an application `TokenProvider`. Token endpoints require HTTPS except for loopback development URLs.

External and static providers implement `configure` and `acquire`, optionally `refresh`. A `TokenSet`
contains `accessToken`, optional `expiresAt` in Unix milliseconds, and optional `refreshToken`. A returned
refresh token replaces the previous one; omission retains it. Expired interactive sessions without refresh
capability and invalid interactive refresh grants require fresh application authorization.

Cache keys include provider/client identity, grant identity, profile, flow, resolved endpoints, scopes,
audience, and resource. Change provider identity with credential configuration and grant identity with
session/grant inputs. The manager defaults to 30 seconds of expiry skew, coalesces concurrent renewal,
and accepts application-owned `TokenStore` storage. Canceling one waiter preserves others; canceling the
last signals acquisition cancellation. Once persistence starts, saving a rotated token finishes even if
callers cancel. A provider result arriving after cancellation cannot start persistence; if an identity
server already consumed that refresh token despite cancellation, interactive clients must authorize again.

The transport attaches complete AND credential sets and checks them on every execution. Bodyless
GET/HEAD/OPTIONS requests may recover one explicit bearer `invalid_token` challenge; POST, streamed bodies,
and 403 responses are never automatically replayed. Managed credential requests use manual redirect
handling, and query credentials are redacted from response diagnostics. Providers never receive secrets
from generated metadata, and provider failures use safe runtime diagnostics.

Credentials are isolated by logical security scheme as well as provider and acquisition inputs.
Discovery metadata is fetched and verified on each acquisition or renewal. Temporary provider outages
allow event connections to reconnect; a rejected refresh grant triggers fresh client credentials only
for the client-credentials flow. Interactive sessions require fresh application authorization.
Built-in OAuth providers retain at most 1,024 consumed authorization-code hashes per provider instance.
After this limit, create a provider for a newly authorized application session; old hashes are never
evicted to allow code reuse. Refresh exchanges do not consume this history.

### Typed request parameters

`parameterValidation` is an optional callback on the request specification. The transport invokes it
before encoding on every request build, including bodyless requests and event streams. Generated
callbacks validate captured typed parameters in request mode; reusing an operation checks mutable
values again. Custom transports must invoke the callback at the same boundary before transmission.

Parameter failures throw `RequestValidationError` with the native validation error as `cause`.
Event sources close on this error, and event stream iterators reject instead of reconnecting.

## URI template variables

`URLTemplate.complete` preserves the distinction between an empty string and a missing,
`undefined`, or `null` value. For `/items{/id}`, `id: ''` produces `/items/`, while an
undefined `id` produces `/items`. An empty collection is undefined; a list containing
an empty string has a defined member. Per-call values override stored template parameters,
including explicit null or undefined values that remove a stored value for that expansion.

## Application-owned token persistence

```typescript
const settings = ClientSettings.resolve(baseUrl, alternatives, credentials, {}, {},
  providers => new TokenManager(providers, {
    store: applicationStore, expirySkewMs: 30_000, now: applicationClock,
  }));
```

The same optional `TokenManagerFactory` is the fourth constructor argument. The last two resolver
arguments before it are scheme selections and alternative-index selections. Clock values and expiry
skew are milliseconds. The native manager has no close/reset method: cancel application requests with
their abort signals, await completion, and discard the manager at session end. The factory does not
change cancellation behavior or take ownership of application resources.

The hook is invoked once with the resolved provider map, after security validation, and is skipped
when no providers are selected. It must only construct a manager: do not acquire tokens or read
storage in the hook. Omitting it keeps the existing in-memory default. Settings retain the returned
manager, not the factory. All operations on those settings share it; generated aggregate children
therefore retain the same cache and single-flight renewal. Independently created managers do not
coordinate concurrent refreshes, even if their stores are the same. Reuse a client/aggregate within
an active session; use successive managers to reopen saved sessions.

The application owns persistence, encryption, store access and session boundaries. Provider/client,
grant, profile and endpoint identities must distinguish environments and users; the API base URL
alone is not an implicit store namespace. Use a new grant identity for a fresh authorization session.
For logout, stop requests and wait for pending refresh/persistence to finish before removing the
session's store entries, then construct fresh settings. `invalidate` expires an access token for
renewal; it is not logout and deliberately retains refresh state. No disk storage is enabled automatically.
