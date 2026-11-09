# Sunday 🙏 The framework of REST for TypeScript/JavaScript

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/outfoxx/sunday-js/ci.yml?branch=main)
![Coverage](https://sonarcloud.io/api/project_badges/measure?project=outfoxx_sunday-js&metric=coverage)
![npm](https://img.shields.io/npm/v/@outfoxx/sunday)

TypeScript/JavaScript framework for generated REST clients.

### [Read the Documentation](https://outfoxx.github.io/sunday)

### [Schema Runtime Guide](./docs/schema-runtime-guide.md)

---

## NPM

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
named providers directly as `new FetchTransport(baseUrl, {tokenProviders: {external: provider}})`. Client secrets,
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

## Application-owned token lifecycle

Transports accept named `TokenProvider` instances directly. Settings preserve supplied providers and
never add a token cache. Every managed network attempt asks its provider for current credentials.
An external framework (for example Auth0) remains responsible for storage, renewal and logout.
Return only its access token and optional expiry; keep its refresh token inside that framework.

For Sunday's caching and refresh lifecycle, explicitly supply a `TokenManager` as the provider:

```typescript
const tokens = new TokenManager(oauthProvider, {
  store: applicationStore,
  expirySkewMs: 30_000,
  now: applicationClock,
});
const settings = ClientSettings.resolve(baseUrl, alternatives, {
  identity: { kind: 'provider', provider: tokens },
});
// Supply an external framework's provider directly instead to keep its lifecycle authoritative.
const transport = FetchTransport.fromSettings(settings);
```

Managers retain expiry skew, coalesced renewal, refresh rotation and application-selected persistence.
Cancel and await outstanding requests before discarding a manager.
Transport closure does not erase the store or close a shared provider. Separate managers do not
coordinate refreshes merely because they share a store. Reuse the same manager across clients that
share a credential lifecycle, and distinguish users/environments with provider and grant identities.

Providers can implement `reject` to handle an invalid bearer token. It receives the original request
context and rejected access token, and returns whether recovery can proceed. Compare the rejected
credential with the current session before renewing: a late rejection must not invalidate a newer token
or a new login. Providers without this capability do not automatically retry. Acquisition and rejection
must not start interactive login automatically; return an authorization-required failure to the caller.
For an Auth0 adapter, retrieve through its credentials manager and force renewal through that same
manager on rejection, serializing concurrent rejection handling without maintaining a second token cache.

Request export materializes an optionally authorized native request once and hands its lifecycle to
the consumer. Exported requests retain no Sunday-managed recovery state. Executing an operation through
Sunday acquires once per attempt and retains the bounded safe-request recovery and SSE reconnect budget.

Migration: replace transport `tokenManager`/`token_manager` arguments with named
`tokenProviders`/`token_providers` maps. Replace `TokenManagerFactory` hooks with explicitly constructed
managers supplied through provider credentials. Direct built-in OAuth providers are not implicitly cached;
wrap them explicitly when Sunday should retain and refresh their tokens. For logout, stop outstanding
requests and settle refresh commits before clearing the owning framework's or application's storage.

## Request and response adapters

`FetchTransport` accepts independent `requestAdapter` and `responseAdapter` options. Each is a
structural interface with an `adapt` method returning a native Fetch value or a promise:

```typescript
const transport = new FetchTransport('https://api.example', {
  requestAdapter: chainRequestAdapters(auth, {
    adapt(request) {
      const headers = new Headers(request.headers);
      headers.set('X-Client', 'example');
      return copyRequest(request, { headers });
    },
  }),
  responseAdapter: chainResponseAdapters(auth, {
    adapt(response, request) {
      console.log(request.method, response.status);
      return response;
    },
  }),
});
```

Here `auth` explicitly implements both capabilities, for example a
`RefreshingHeaderTokenAuthorizingAdapter`. Installing only its request capability does not install
its response capability. `RequestAdapters` and `ResponseAdapters` also provide `chainTo`; composition
flattens existing chains. Plain objects need no inheritance or prototype extensions.

Adapters run once per Sunday-managed Fetch call, with response adaptation before validation or body
consumption. Authentication receipts and retry budgets remain local to the operation. Provider rejection
runs for every matching `401 invalid_token`, including unsafe methods and exhausted retry budgets; a
provider declining recovery raises `RequestCancellationError`. Sunday permits one authentication retry
for a bodyless GET, HEAD, or OPTIONS, reapplying request adapters. An SSE subscription shares that budget
across reconnects. GET and HEAD are intrinsically bodyless; OPTIONS recovery requires an inspectable
empty body, so it remains disabled where `Request.body` is unavailable. `TokenProvider` implementations
own their cache and refresh behavior; wrapping one in `TokenManager` explicitly opts into Sunday's caching.

Fetch retains its native redirects and recovery. Adapters cannot observe hidden intermediate responses
or wire-level changes from service workers/custom Fetch implementations. The response adapter receives
the request submitted to Fetch. Changing response status or Location afterward does not initiate a new
native redirect. Credentialed calls use manual redirects and omit ambient credentials; browsers expose
manual redirect responses as `opaqueredirect`, without readable status or Location. An adapter may handle
that response, but Sunday does not emulate browser redirect internals.

Throw `RequestCancellationError`, subclass it, or brand an existing application Error with
`[requestCancellation]: true` to stop without retry or SSE reconnection. Sunday preserves that stop
instance, including when native Fetch carries it as an error cause. Sunday does not inspect causes
of errors thrown by adapters, decoders, or supplied Fetch callbacks. Native aborts also stop; `AbortSignal.any`
preserves cancellation from the invocation and adapter-provided signals, including the original abort
reason. Async adapters should observe `request.signal`. Sunday stops awaiting an aborted adapter and
cleans up late returned resources; JavaScript cannot forcibly terminate arbitrary application promises.
Cancellation also reaches owned upload and replacement-response streams while an adapter or native
body reader is consuming them. Cleanup releases readers without waiting for a producer's cleanup
promise. Late adapter results receive the original cancellation reason.
Event-source handler properties and EventTarget listeners are observers. Thrown exceptions and rejected
callback promises follow the runtime's native event-error reporting; they do not request retries or
cancellation, even when the error carries a stop marker. Use `close()` or an abort signal to stop a
subscription. Registered listeners run before the handler property and can suppress it with
`stopImmediatePropagation()`. `onmessage` continues to receive named SSE messages as well as default
messages.

A failed parallel credential acquisition cancels its siblings. `RefreshingHeaderTokenAuthorizingAdapter`
uses `TokenManager` to coalesce refreshes and prevent invalidated tokens from returning to the cache.

An adapter consuming a body must return a replacement. Use `copyRequest` / `copyResponse` to preserve
known body ownership through native constructors. Sunday does not call `clone()` or add a stream tee;
native Request copying may create branches, and Sunday immediately cancels the obsolete input branch
without waiting for its cleanup. The active body retains native streaming and replay behavior.
Prepare new upload streams with `prepareRequestBody` before constructing a Request.
These helpers share/transfer the existing body; do not subsequently consume it through the old value.
`copyResponse` preserves URL/type/redirect metadata for inspectable responses; opaque/error responses
cannot be reconstructed by Fetch's Response constructor. URL-changing request copies transfer the body
as a stream, so provide a fresh BodyInit if native replayability is needed. Same-URL copies retain
native body sources on all supported platforms.

No-op and header-only response adapters retain native Fetch body capabilities, including BYOB readers
where the platform provides them. Independent replacement streams share one source owner for
cancellation and source-error capture. Original errors are restored only around native body reads or
Fetch itself; errors deliberately thrown by adapters are never classified as substituted body errors.

`transportRequest()` exports an optionally authorized, adapted request exactly once. Its consumer owns
execution (`fetch(exportedRequest)`), response processing, and retry policy. Passing a native Request to
`transportResponse()` instead starts a new managed invocation. Migrate old `adapt(transport, request)`
implementations to `adapt(request)` and pass `requestAdapter`; `adapter` remains a deprecated constructor
option accepting the new signature.

Bun execution requires Bun 1.4 or newer for UTF-8 SSE reconnect IDs: older Bun releases
re-encode Fetch header bytes and corrupt `Last-Event-ID`. Development and CI use Bun 1.4.4.

The standard `bun run check` includes native-socket Node/Bun checks and Chromium, Firefox, and WebKit
adapter regressions. Install browsers with `bunx playwright install chromium firefox webkit` (CI uses
`--with-deps`). The HTTP/2 upload fixture also requires Node and OpenSSL; it creates a temporary,
self-signed loopback certificate and removes it after testing. Tests cover buffered and streaming
execution, cancellation, body ownership, exception identity, and native redirects.

Browser request streaming is a separate capability from response streaming. Verified with Playwright
1.65.0 on macOS: Chromium 158.0.8127.18 and WebKit 27.2 upload copied request streams over HTTPS/HTTP/2,
including bytes produced before the stream closes. Firefox 159.0 still stringifies streams passed
directly to native Request. Sunday now buffers unsupported upload streams into a Blob **before**
constructing the request, preserving their bytes. Supported runtimes retain native streaming.

The fallback buffers at most **16 MiB** by default. Set `maxBufferedRequestBytes` on `FetchTransport`
to change this bound; it does not limit native streaming uploads. Buffering waits for the producer to
finish before transmission. An oversized body fails with RangeError and cancels its source. Aborts and
source errors retain their original identity, and cancellation does not wait for source cleanup.
Existing Blob/string/form bodies are unchanged, and buffering does not add Sunday retries or caches.

Adapters that introduce a stream use the same exported helper before constructing their replacement
request. For example, an adapter supplying the body of an initially bodyless POST can use:

```typescript
const body = await prepareRequestBody(makeUploadStream(), {
  signal: request.signal,
  maxBytes: 16 * 1024 * 1024,
});
return copyRequest(request, { body, duplex: 'half' });
```

`prepareRequestBody` passes through supported streams and other BodyInit values unchanged; its
`maxBytes` applies only to the fallback. `bufferToBlob(stream, options)` explicitly buffers on any
runtime with the same cancellation and limit behavior. These helpers consume the source when buffering
and must run before native Request construction: an already-stringified Firefox request cannot be
recovered. When changing a request URL with `copyRequest`, also normalize and pass its existing body
explicitly: rebuilding a native Request at a new URL exposes that body as a stream again. On engines
without `Request.body` (including Firefox 159), retrieve an existing body with `request.blob()` instead.
Sunday preserves the body through both paths when adding query credentials.
Adapters remain responsible for replacing/discarding resources they consume.

`supportsStreamingUploads()` caches a runtime capability probe without network requests. It does not
check the destination's HTTP version or server behavior, and Sunday never retries a failed transmission
to select the fallback. Bun supports uploads without reading `duplex`, which the probe accounts for.
The browser tests compare native and Sunday request copying explicitly and save the exact engine
versions and observed upload outcomes in `reports/browser-streaming-*.json`. Shared buffer contract
checks run in Chromium, Firefox, WebKit, Node, and Bun. The same async execution contracts run in all
five engines, covering replacement-body cleanup, original error identity, credential acquisition and
recovery, refresh coordination, and concurrent SSE iterator reads. The ownership matrix also checks
native byte-stream capabilities, adapter-selected errors, upload failures, and late resource cleanup.
The lifecycle matrix also checks atomic credential setup, unhandled rejections, nested application
errors, truncated SSE reconnections, and suppression of callbacks after termination.
CI runs WebKit on macOS to exercise Safari's network implementation; Chromium, Firefox, Node, and Bun
run on Linux. Playwright's Linux WebKit backend advertises streaming uploads but cannot send them,
and reports remote HTTP/2 resets as aborts. The constructor-only capability probe cannot detect those
backend limitations. Applications targeting that backend can explicitly use `bufferToBlob` for uploads.
`SUNDAY_TEST_BROWSERS=webkit` selects a browser suite locally (a comma-separated list is also accepted).
See the [ownership and failure audit](documentation/adapter-ownership-audit.md) for the recurring causes,
pre-existing defects versus refactor regressions, and the checks to carry into other runtimes.

## Binary downloads

Generated operations set `RequestSpec.binaryResponse` for whole-body binary responses,
including unions whose branches are all binary. `FetchTransport` then preserves the
raw bytes regardless of `Content-Type`, while applying the response schema and retaining
normal HTTP problem handling. This also permits download media types without a registered
media decoder. Manually constructed binary request specs can set the same flag.

Mixed binary/non-binary unions and binary fields inside structured documents continue to
use media decoding. Successful 200 responses may contain an empty `ArrayBuffer`; typed
204/205 responses retain the existing empty-response error behavior.
