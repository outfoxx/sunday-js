import { BinaryDecoder } from './binary-decoder';
import { CBORDecoder } from './cbor-decoder';
import { JSONDecoder } from './json-decoder';
import { MediaType } from './media-type';
import { MediaTypeDecoder } from './media-type-decoder';

export interface MediaTypeDecodersBuilder {
  addDefaults(): MediaTypeDecodersBuilder;

  add(mediaType: string, decoder: MediaTypeDecoder): MediaTypeDecodersBuilder;

  build(): MediaTypeDecoders;
}
export interface MediaTypeDecodersBuilderConstructor {
  new (): MediaTypeDecodersBuilder;
}

export class MediaTypeDecoders {
  static Builder: MediaTypeDecodersBuilderConstructor = class Builder
    implements MediaTypeDecodersBuilder {
    decoders = new Map<string, MediaTypeDecoder>();

    add(
      mediaType: string,
      decoder: MediaTypeDecoder
    ): MediaTypeDecodersBuilder {
      this.decoders.set(mediaType, decoder);
      return this;
    }

    addDefaults(): MediaTypeDecodersBuilder {
      return this.add(MediaType.JSON, JSONDecoder.default)
        .add(MediaType.OCTET_STREAM, new BinaryDecoder())
        .add(MediaType.CBOR, CBORDecoder.default);
    }

    build(): MediaTypeDecoders {
      return new MediaTypeDecoders(this.decoders);
    }
  };

  static DEFAULT: MediaTypeDecoders = new MediaTypeDecoders.Builder()
    .addDefaults()
    .build();

  constructor(private decoders: Map<string, MediaTypeDecoder>) {}

  supports(mediaType: string): boolean {
    return this.decoders.has(mediaType);
  }

  find(mediaType: string): MediaTypeDecoder {
    const decoder = this.decoders.get(mediaType);
    if (!decoder) {
      throw Error(`Unsupported media type - ${mediaType}`);
    }
    return decoder;
  }
}
