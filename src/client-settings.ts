// Copyright 2020 Outfox, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Credentials, validateCredentials } from './credentials.js';
import { SecurityBinding } from './security-binding.js';
import { TokenManager } from './token-manager.js';
import { TokenProvider } from './token-provider.js';

/** Resolved, transport-independent inputs supplied to an application's transport factory. */
export class ClientSettings {
  readonly baseUrl: string;
  /** Prepared manager shared by this configuration's operations; construction never acquires tokens. */
  readonly tokenManager: TokenManager | undefined;
  readonly bindings: Readonly<Record<string, readonly SecurityBinding[]>>;
  readonly #credentials: ReadonlyMap<string, Credentials>;

  /** Snapshots operation bindings and credentials without acquiring tokens or making requests. */
  constructor(baseUrl: string, bindings: Readonly<Record<string, readonly SecurityBinding[]>> = {},
    credentials: Readonly<Record<string, Credentials>> = {}) {
    const url = new URL(baseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.includes('?') || url.href.includes('#')) throw new TypeError('Client endpoint must be HTTP or HTTPS');
    this.baseUrl = url.href;
    this.bindings = Object.freeze(Object.fromEntries(Object.entries(bindings).map(([operation, values]) =>
      [operation, Object.freeze(values.map(value => Object.freeze({
        ...value,
        ...Object.fromEntries(['discoveryUrl', 'authorizationUrl', 'tokenUrl', 'refreshUrl'].flatMap(key => {
          const endpoint = value[key as keyof SecurityBinding];
          if (typeof endpoint !== 'string') return [];
          if (/[{}]/.test(endpoint)) throw new TypeError('Security endpoint URLs do not support server variables');
          return [[key, new URL(endpoint, baseUrl).href]];
        })),
        scopes: Object.freeze([...value.scopes]), transport: Object.freeze({ ...value.transport }),
      })))])));
    this.#credentials = new Map(Object.entries(credentials).map(([scheme, value]) =>
      [scheme, Object.freeze({ ...value, ...(value.kind === 'oauth' && value.endpoints
        ? { endpoints: Object.freeze(Object.fromEntries(Object.entries(value.endpoints).map(([key, endpoint]) => {
          if (endpoint === undefined) return [key, undefined];
          if (/[{}]/.test(endpoint)) throw new TypeError('Security endpoint URLs do not support server variables');
          return [key, new URL(endpoint, baseUrl).href];
        }))) } : {}) })]));
    for (const binding of Object.values(this.bindings).flat()) {
      const credential = this.#credentials.get(binding.scheme);
      if (!credential) throw new TypeError(`Missing credentials for scheme '${binding.scheme}'`);
      validateCredentials(credential, binding);
    }
    this.tokenManager = this.prepareTokenManager();
    Object.freeze(this);
  }

  /** Expands server variables once and resolves relative servers against their document location. */
  static serverUrl(template: string, variables: Readonly<Record<string, string>>, documentBaseUrl?: string): string {
    const expanded = template.replace(/\{([^{}]+)\}/g, (_match, name: string) => {
      if (!Object.hasOwn(variables, name)) throw new TypeError(`Missing server variable '${name}'`);
      return variables[name];
    });
    const url = new URL(expanded, documentBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError('Invalid HTTP server endpoint');
    }
    return url.href;
  }

  /**
   * Chooses one complete alternative per operation using credentials and optional explicit scheme sets.
   * `alternativeSelection` selects a zero-based candidate index, including its scopes and endpoint metadata.
   */
  static resolve(baseUrl: string, alternatives: Readonly<Record<string, readonly (readonly SecurityBinding[])[]>>,
    credentials: Readonly<Record<string, Credentials>>, selection: Readonly<Record<string, readonly string[]>> = {},
    alternativeSelection: Readonly<Record<string, number>> = {}): ClientSettings {
    if ([...Object.keys(selection), ...Object.keys(alternativeSelection)].some(operation => !Object.hasOwn(alternatives, operation))) {
      throw new TypeError('Unknown operation selection');
    }
    const bindings: Record<string, readonly SecurityBinding[]> = Object.create(null);
    for (const [operation, candidates] of Object.entries(alternatives)) {
      const selected = Object.hasOwn(selection, operation) ? selection[operation] : undefined;
      const selectedIndex = Object.hasOwn(alternativeSelection, operation) ? alternativeSelection[operation] : undefined;
      const usable = candidates.filter((candidate, index) => {
        if (selectedIndex !== undefined && selectedIndex !== index) return false;
        if (selected && (selected.length !== candidate.length || candidate.some(binding => !selected.includes(binding.scheme)))) return false;
        return candidate.every(binding => {
          const credential = Object.hasOwn(credentials, binding.scheme) ? credentials[binding.scheme] : undefined;
          if (!credential) return false;
          try { validateCredentials(credential, binding); return true; } catch { return false; }
        });
      });
      if (usable.length !== 1) throw new TypeError(`Operation '${operation}' requires one complete security alternative`);
      bindings[operation] = usable[0];
    }
    return new ClientSettings(baseUrl, bindings, credentials);
  }

  private prepareTokenManager(): TokenManager | undefined {
    const providers = new Map<string, TokenProvider>();
    const owners = new Map<string, string>();
    for (const binding of Object.values(this.bindings).flat()) {
      const previous = owners.get(binding.provider);
      if (previous !== undefined && previous !== binding.scheme) {
        throw new TypeError('Distinct credential schemes require distinct provider bindings');
      }
      if (previous !== undefined) continue;
      owners.set(binding.provider, binding.scheme);
      providers.set(binding.provider, this.prepareProvider(this.#credentials.get(binding.scheme)!));
    }
    return providers.size ? new TokenManager(Object.fromEntries(providers)) : undefined;
  }

  private prepareProvider(credentials: Credentials): TokenProvider {
    if (credentials.kind === 'provider') return credentials.provider;
    if (credentials.kind === 'oauth') return credentials.providerFactory(credentials);
    const identity = crypto.randomUUID();
    let token: string;
    switch (credentials.kind) {
      case 'bearer': token = credentials.token; break;
      case 'apiKey': token = credentials.key; break;
      case 'basic':
        token = btoa(Array.from(new TextEncoder().encode(`${credentials.username}:${credentials.password}`),
          byte => String.fromCodePoint(byte)).join(''));
        break;
    }
    return {
      identity,
      configure: () => ({ clientIdentity: identity }),
      acquire: () => Promise.resolve({ accessToken: token }),
    };
  }

}
