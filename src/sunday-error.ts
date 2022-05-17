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

import { ResponseExample } from './fetch';

export class SundayError extends Error {
  constructor(
    message: string,
    public url: string,
    public httpVersion: string,
    public status: number,
    public statusText: string,
    public headers: Headers,
    public body: unknown | undefined,
    public responseExample: string
  ) {
    super(message);
  }

  static async fromResponse(
    message: string,
    response: Response
  ): Promise<SundayError> {
    const [bodyExcerpt, body] = await ResponseExample.bodyExcerpt(
      response,
      256
    );

    return new SundayError(
      message,
      response.url,
      '?.?',
      response.status,
      response.statusText,
      response.headers,
      body,
      ResponseExample.build(response, bodyExcerpt)
    );
  }
}
