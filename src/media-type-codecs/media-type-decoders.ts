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

import { AnyTextDecoder } from './any-text-decoder';
import { BinaryDecoder } from './binary-decoder';
import { CBORDecoder } from './cbor-decoder';
import { JSONDecoder } from './json-decoder';
import { MediaType } from '../media-type';
import { MediaTypeDecoder } from './media-type-decoder';

export interface MediaTypeDecodersBuilder {
  addDefaults(): MediaTypeDecodersBuilder;

  add(
    mediaType: MediaType,
    decoder: MediaTypeDecoder,
  ): MediaTypeDecodersBuilder;

  build(): MediaTypeDecoders;
}
export interface MediaTypeDecodersBuilderConstructor {
  new (): MediaTypeDecodersBuilder;
}

export class MediaTypeDecoders {
  static Builder: MediaTypeDecodersBuilderConstructor = class Builder
    implements MediaTypeDecodersBuilder
  {
    decoders = new Map<MediaType, MediaTypeDecoder>();

    add(
      mediaType: MediaType,
      decoder: MediaTypeDecoder,
    ): MediaTypeDecodersBuilder {
      this.decoders.set(mediaType, decoder);
      return this;
    }

    addDefaults(): MediaTypeDecodersBuilder {
      return this.add(MediaType.OctetStream, BinaryDecoder.default)
        .add(MediaType.JSON, JSONDecoder.default)
        .add(MediaType.CBOR, CBORDecoder.default)
        .add(MediaType.EventStream, BinaryDecoder.default)
        .add(MediaType.AnyText, AnyTextDecoder.default)
        .add(MediaType.X509CACert, BinaryDecoder.default)
        .add(MediaType.X509UserCert, BinaryDecoder.default);
    }

    build(): MediaTypeDecoders {
      return new MediaTypeDecoders(this.decoders);
    }
  };

  static DEFAULT: MediaTypeDecoders = new MediaTypeDecoders.Builder()
    .addDefaults()
    .build();

  constructor(private decoders: Map<MediaType, MediaTypeDecoder>) {}

  supports(mediaType: MediaType): boolean {
    return Array.from(this.decoders.keys()).some((key) =>
      key.compatible(mediaType),
    );
  }

  find(mediaType: MediaType): MediaTypeDecoder {
    const found = Array.from(this.decoders.entries()).find(([type]) =>
      type.compatible(mediaType),
    );
    if (!found) {
      throw Error(`Unsupported media type - ${mediaType}`);
    }
    return found[1];
  }
}
