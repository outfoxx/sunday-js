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

import { MediaType } from './media-type.js';
import { Logger } from './logger.js';
import { Problem, ProblemSchema } from './problem.js';
import {
  ArrayBufferEncoding,
  createSchemaRuntime,
  DateEncoding,
  NumericDateDecoding,
  SchemaLike,
} from './schema-runtime.js';
import { SundayError } from './sunday-error.js';
import { errorToMessage } from './util/errors.js';

const problemRuntime = createSchemaRuntime({
                                             format: 'json',
                                             dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
                                             numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
                                             arrayBufferEncoding: ArrayBufferEncoding.BASE64,
                                           });

export async function validate(
  response: Response,
  dataExpected: boolean,
  problemTypes?: Map<string, SchemaLike<Problem>>,
  logger?: Logger,
): Promise<Response> {
  if (response.status < 200 || response.status >= 300) {
    const mediaType = MediaType.from(
      response.headers.get('content-type'),
      MediaType.OctetStream,
    );
    const isProblem = mediaType?.compatible(MediaType.Problem) ?? false;
    if (!isProblem) {
      throw await Problem.fromResponse(response);
    }

    const problemData = normalizeProblemData(
      await response.json(),
      response,
      logger,
    );
    const type = readProblemType(problemData);
    const problemSchema = (type ? problemTypes?.get(type) : undefined) ?? ProblemSchema;
    let error: Error;
    try {
      error = problemRuntime.resolveSchema(problemSchema).decode(problemData);
    } catch (decodeError) {
      error = new SundayError(
        `Invalid problem response: ${errorToMessage(decodeError)}`,
        response.url,
        response.status,
        response.statusText,
        response.headers,
        problemData,
        ResponseExample.build(response),
      );
    }
    throw error;
  }

  if (dataExpected && (response.status === 204 || response.status === 205)) {
    throw await SundayError.fromResponse('Unexpected Empty Response', response);
  }

  return response;
}

function normalizeProblemData(
  value: unknown,
  response: Response,
  logger?: Logger,
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const problemData: Record<string, unknown> = { ...value as Record<string, unknown> };
  if (problemData.status === undefined) {
    logger?.warn?.(
      'problem response payload missing required "status"; backfilling from HTTP response status',
      { status: response.status, statusText: response.statusText },
    );
    problemData.status = response.status;
  }
  if (problemData.title === undefined) {
    logger?.warn?.(
      'problem response payload missing required "title"; backfilling from HTTP response status text',
      { status: response.status, statusText: response.statusText },
    );
    problemData.title = response.statusText;
  }

  return problemData;
}

function readProblemType(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const rec = value as Record<string, unknown>;
  return typeof rec.type === 'string' ? rec.type : undefined;
}

export namespace ResponseExample {
  export function build(response: Response, bodyExample?: string): string {
    return (
      `HTTP/?.? ${response.status} ${response.statusText}\n` +
      Array.from(response.headers.entries())
           .map(([name, value]) => `${name}: ${value}\n`)
           .join('') +
      '\n' +
      (bodyExample ?? '<none>')
    );
  }

  export async function bodyExcerpt(
    response: Response,
    maxLength: number,
  ): Promise<[string, unknown]> {
    let body: unknown;
    let bodyExcerpt: string;
    try {
      if (response.headers.get('content-type')?.startsWith('text/')) {
        const text = await response.text();
        body = text;
        if (text.length > maxLength) {
          const exampleText = text.slice(0, maxLength);
          const remainingTextLength = text.length - maxLength;
          bodyExcerpt = `${exampleText}<<... ${remainingTextLength} characters>>`;
        }
        else {
          bodyExcerpt = text;
        }
      }
      else {
        const blob = await response.blob();
        body = blob;
        if (blob.size > maxLength) {
          bodyExcerpt = `<<binary data: ${blob.size} bytes>>`;
        }
        else {
          const dataSlice = await blob.slice(0, maxLength).bytes();
          bodyExcerpt = dataSlice.toBase64({ omitPadding: true });
        }
      }
    }
    catch (error) {
      // ignore errors
      const message = errorToMessage(error);
      body = bodyExcerpt = `<<error displaying response data: ${message}>>`;
    }
    return [bodyExcerpt, body];
  }
}

export function mergeHeaders(...allHeaders: (Headers | HeadersInit | undefined)[]): Headers {

  function entries(headersInit?: HeadersInit): Iterable<[string, string]> {
    if (!headersInit) {
      return [];
    }
    if (headersInit instanceof Headers) {
      return headersInit.entries();
    }
    if (Array.isArray(headersInit)) {
      return headersInit as Iterable<[string, string]>;
    }
    return Object.entries(headersInit);
  }

  const merged = new Headers();
  for (const headers of allHeaders) {
    for (const [name, value] of entries(headers)) {
      merged.append(name, value);
    }
  }
  return merged;
}
