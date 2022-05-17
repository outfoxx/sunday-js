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

import { ConstructableClassType } from './class-type';
import { MediaType } from './media-type';
import { Problem } from './problem';
import { SundayError } from './sunday-error';
import { Base64 } from './util/base64';
import { errorToMessage } from './util/error';

export async function validate(
  response: Response,
  dataExpected: boolean,
  problemTypes?: Map<string, ConstructableClassType<Problem>>
): Promise<Response> {
  if (response.status < 200 || response.status >= 300) {
    const mediaType = MediaType.from(
      response.headers.get('content-type'),
      MediaType.OctetStream
    );
    const isProblemJSON = mediaType?.compatible(MediaType.ProblemJSON) ?? false;
    if (!isProblemJSON) {
      throw await Problem.fromResponse(response);
    }

    const problemData = await response.json();
    const problemType = problemTypes?.get(problemData.type) ?? Problem;
    throw new problemType(problemData as Problem);
  }

  if (dataExpected && (response.status === 204 || response.status === 205)) {
    throw await SundayError.fromResponse('Unexpected Empty Response', response);
  }

  return response;
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
    maxLength: number
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
        } else {
          bodyExcerpt = text;
        }
      } else {
        const blob = await response.blob();
        body = blob;
        if (blob.size > maxLength) {
          bodyExcerpt = `<<binary data: ${blob.size} bytes>>`;
        } else {
          const dataSlice = await blob.slice(0, maxLength).arrayBuffer();
          bodyExcerpt = Base64.encode(dataSlice);
        }
      }
    } catch (error) {
      // ignore errors
      const message = errorToMessage(error);
      body = bodyExcerpt = `<<error displaying response data: ${message}>>`;
    }
    return [bodyExcerpt, body];
  }
}
