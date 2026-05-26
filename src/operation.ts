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

import { Transport, RequestSpec } from './transport.js';
import { OperationResponse } from './operation-response.js';
import { SchemaLike } from './schema-runtime.js';
import { nullifyProblem, type ProblemMatcher } from './util/nullify.js';

/** Extracts the native request type from a transport. */
export type TransportRequest<Factory> =
  Factory extends Transport<infer NativeRequest> ? NativeRequest : never;

/** Options used when converting an operation into a native request. */
export interface BuildRequestOptions {
  readonly signal?: AbortSignal;
}

/** Options used when executing an operation. */
export interface ExecuteOptions {
  readonly signal?: AbortSignal;
}

/** Describes the generated HTTP request and optional response decoder for an operation. */
export interface OperationSpec<RequestBody, ResponseBody> {
  readonly request: RequestSpec<RequestBody>;
  readonly responseType?: SchemaLike<ResponseBody>;
}

/** Describes an operation with no decoded response body. */
export interface VoidOperationSpec<RequestBody = void> extends OperationSpec<RequestBody, void> {
  readonly responseType?: undefined;
}

/** Describes an operation with a decoded response body. */
export interface TypedOperationSpec<RequestBody, ResponseBody> extends OperationSpec<RequestBody, ResponseBody> {
  readonly responseType: SchemaLike<ResponseBody>;
}

/** Describes problems that should be translated into a null response value. */
export interface NullifySpec {
  readonly statuses: readonly number[];
  readonly problemTypes: readonly ProblemMatcher[];
}

/** A generated operation that can be executed or converted into a native transport request. */
export interface Operation<
  RequestBody,
  ResponseBody,
  Factory extends Transport<unknown> = Transport,
> {
  readonly spec: OperationSpec<RequestBody, ResponseBody>;

  execute(options?: ExecuteOptions): Promise<ResponseBody>;

  response(options?: ExecuteOptions): Promise<OperationResponse<ResponseBody>>;

  transportRequest(options?: BuildRequestOptions): Promise<TransportRequest<Factory>>;

  transportResponse(options?: ExecuteOptions): Promise<Response>;
}

/** A generated operation that can execute select problems as null responses. */
export interface NullableOperation<
  RequestBody,
  ResponseBody,
  Factory extends Transport<unknown> = Transport,
> extends Operation<RequestBody, ResponseBody, Factory> {
  readonly nullify: NullifySpec;

  executeOrNull(options?: ExecuteOptions): Promise<ResponseBody | null>;

  responseOrNull(options?: ExecuteOptions): Promise<OperationResponse<ResponseBody> | null>;
}

/** Creates an operation with a decoded response body. */
export function createOperation<RequestBody = void, ResponseBody = void, Factory extends Transport<unknown> = Transport>(
  transport: Factory,
  spec: TypedOperationSpec<RequestBody, ResponseBody>,
): Operation<RequestBody, ResponseBody, Factory>;

/** Creates an operation with no decoded response body. */
export function createOperation<RequestBody = void, Factory extends Transport<unknown> = Transport>(
  transport: Factory,
  spec: VoidOperationSpec<RequestBody>,
): Operation<RequestBody, void, Factory>;

export function createOperation<RequestBody, ResponseBody, Factory extends Transport<unknown>>(
  transport: Factory,
  spec: OperationSpec<RequestBody, ResponseBody>,
): Operation<RequestBody, ResponseBody, Factory> {
  return new TransportOperation(transport, spec);
}

/** Creates a nullable operation with a decoded response body. */
export function createNullableOperation<RequestBody = void, ResponseBody = void, Factory extends Transport<unknown> = Transport>(
  transport: Factory,
  spec: TypedOperationSpec<RequestBody, ResponseBody>,
  nullify: NullifySpec,
): NullableOperation<RequestBody, ResponseBody, Factory>;

/** Creates a nullable operation with no decoded response body. */
export function createNullableOperation<RequestBody = void, Factory extends Transport<unknown> = Transport>(
  transport: Factory,
  spec: VoidOperationSpec<RequestBody>,
  nullify: NullifySpec,
): NullableOperation<RequestBody, void, Factory>;

export function createNullableOperation<RequestBody, ResponseBody, Factory extends Transport<unknown>>(
  transport: Factory,
  spec: OperationSpec<RequestBody, ResponseBody>,
  nullify: NullifySpec,
): NullableOperation<RequestBody, ResponseBody, Factory> {
  return new TransportNullableOperation(transport, spec, nullify);
}

class TransportOperation<RequestBody, ResponseBody, Factory extends Transport<unknown>>
  implements Operation<RequestBody, ResponseBody, Factory> {
  constructor(
    private readonly transport: Factory,
    readonly spec: OperationSpec<RequestBody, ResponseBody>,
  ) {
  }

  async execute(options?: ExecuteOptions): Promise<ResponseBody> {
    const request = requestWithOptions(this.spec.request, options);

    if (this.spec.responseType) {
      return this.transport.result(request, this.spec.responseType);
    }

    return this.transport.result(request) as Promise<ResponseBody>;
  }

  async response(options?: ExecuteOptions): Promise<OperationResponse<ResponseBody>> {
    const request = requestWithOptions(this.spec.request, options);

    if (this.spec.responseType) {
      return this.transport.response(request, this.spec.responseType);
    }

    return this.transport.response(request) as Promise<OperationResponse<ResponseBody>>;
  }

  async transportRequest(options?: BuildRequestOptions): Promise<TransportRequest<Factory>> {
    return this.transport.transportRequest(requestWithOptions(this.spec.request, options)) as Promise<TransportRequest<Factory>>;
  }

  async transportResponse(options?: ExecuteOptions): Promise<Response> {
    const request = await this.transportRequest(options);
    return this.transport.transportResponse(request);
  }
}

class TransportNullableOperation<RequestBody, ResponseBody, Factory extends Transport<unknown>>
  implements NullableOperation<RequestBody, ResponseBody, Factory> {
  private readonly operation: Operation<RequestBody, ResponseBody, Factory>;

  constructor(
    transport: Factory,
    readonly spec: OperationSpec<RequestBody, ResponseBody>,
    readonly nullify: NullifySpec,
  ) {
    this.operation = new TransportOperation(transport, spec);
  }

  async execute(options?: ExecuteOptions): Promise<ResponseBody> {
    return this.operation.execute(options);
  }

  async executeOrNull(options?: ExecuteOptions): Promise<ResponseBody | null> {
    return nullifyProblem(
      this.operation.execute(options),
      [...this.nullify.statuses],
      [...this.nullify.problemTypes],
    );
  }

  async responseOrNull(options?: ExecuteOptions): Promise<OperationResponse<ResponseBody> | null> {
    return nullifyProblem(
      this.operation.response(options),
      [...this.nullify.statuses],
      [...this.nullify.problemTypes],
    );
  }

  async response(options?: ExecuteOptions): Promise<OperationResponse<ResponseBody>> {
    return this.operation.response(options);
  }

  async transportRequest(options?: BuildRequestOptions): Promise<TransportRequest<Factory>> {
    return this.operation.transportRequest(options);
  }

  async transportResponse(options?: ExecuteOptions): Promise<Response> {
    return this.operation.transportResponse(options);
  }
}

function requestWithOptions<RequestBody>(
  request: RequestSpec<RequestBody>,
  options?: ExecuteOptions | BuildRequestOptions,
): RequestSpec<RequestBody> {
  if (options?.signal === undefined) {
    return request;
  }

  return {
    ...request,
    signal: options.signal,
  };
}
