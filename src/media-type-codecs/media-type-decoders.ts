import { BinaryDecoder } from './binary-decoder';
import { CBORDecoder } from './cbor-decoder';
import { JSONDecoder } from './json-decoder';
import { MediaType } from '../media-type';
import { MediaTypeDecoder } from './media-type-decoder';

export interface MediaTypeDecodersBuilder {
  addDefaults(): MediaTypeDecodersBuilder;

  add(
    mediaType: MediaType,
    decoder: MediaTypeDecoder
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
      decoder: MediaTypeDecoder
    ): MediaTypeDecodersBuilder {
      this.decoders.set(mediaType, decoder);
      return this;
    }

    addDefaults(): MediaTypeDecodersBuilder {
      return this.add(MediaType.JSON, JSONDecoder.default)
        .add(MediaType.OctetStream, new BinaryDecoder())
        .add(MediaType.CBOR, CBORDecoder.default);
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
      key.compatible(mediaType)
    );
  }

  find(mediaType: MediaType): MediaTypeDecoder {
    const found = Array.from(this.decoders.entries()).find(([type]) =>
      type.compatible(mediaType)
    );
    if (!found) {
      throw Error(`Unsupported media type - ${mediaType}`);
    }
    return found[1];
  }
}
