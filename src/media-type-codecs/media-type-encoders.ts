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

import { MediaType } from '../media-type.js';
import { AnyTextEncoder } from './any-text-encoder.js';
import { BinaryEncoder } from './binary-encoder.js';
import { CBOREncoder } from './cbor-encoder.js';
import { JSONEncoder } from './json-encoder.js';
import { MediaTypeEncoder } from './media-type-encoder.js';
import { WWWFormUrlEncoder } from './www-form-url-encoder.js';

export interface MediaTypeEncodersBuilder {
  addDefaults(): MediaTypeEncodersBuilder;

  add(
    mediaType: MediaType,
    encoder: MediaTypeEncoder,
  ): MediaTypeEncodersBuilder;

  build(): MediaTypeEncoders;
}
export interface MediaTypeEncodersBuilderConstructor {
  new (): MediaTypeEncodersBuilder;
}

export class MediaTypeEncoders {
  static Builder: MediaTypeEncodersBuilderConstructor = class Builder
    implements MediaTypeEncodersBuilder
  {
    encoders = new Map<MediaType, MediaTypeEncoder>();

    add(
      mediaType: MediaType,
      encoder: MediaTypeEncoder,
    ): MediaTypeEncodersBuilder {
      this.encoders.set(mediaType, encoder);
      return this;
    }

    addDefaults(): MediaTypeEncodersBuilder {
      return this.add(MediaType.OctetStream, BinaryEncoder.default)
        .add(MediaType.WWWFormUrlEncoded, WWWFormUrlEncoder.default)
        .add(MediaType.JSON, JSONEncoder.default)
        .add(MediaType.JSONStructured, JSONEncoder.default)
        .add(MediaType.CBOR, CBOREncoder.default)
        .add(MediaType.AnyText, AnyTextEncoder.default)
        .add(MediaType.X509CACert, BinaryEncoder.default)
        .add(MediaType.X509UserCert, BinaryEncoder.default);
    }

    build(): MediaTypeEncoders {
      return new MediaTypeEncoders(this.encoders);
    }
  };

  static DEFAULT: MediaTypeEncoders = new MediaTypeEncoders.Builder()
    .addDefaults()
    .build();

  constructor(private encoders: Map<MediaType, MediaTypeEncoder>) {}

  supports(mediaType: MediaType): boolean {
    for (const key of this.encoders.keys()) {
      if (key.compatible(mediaType)) {
        return true;
      }
    }
    return false;
  }

  find(mediaType: MediaType): MediaTypeEncoder {
    for (const [type, encoder] of this.encoders.entries()) {
      if (type.compatible(mediaType)) {
        return encoder;
      }
    }
    throw Error(`Unsupported media type - ${mediaType}`);
  }
}
