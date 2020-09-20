import { CBOREncoder } from './cbor-encoder';
import { MediaTypeEncoder } from './media-type-encoder';
import { MediaType } from './media-type';
import { JSONEncoder } from './json-encoder';
import { BinaryEncoder } from './binary-encoder';
import { URLEncoder } from './url-encoder';

export class MediaTypeEncoders {
  static Builder = class Builder {
    encoders = new Map<string, MediaTypeEncoder>();

    add(mediaType: string, encoder: MediaTypeEncoder): Builder {
      this.encoders.set(mediaType, encoder);
      return this;
    }

    addDefaults(): Builder {
      return this.add(MediaType.JSON, JSONEncoder.default)
        .add(MediaType.OCTET_STREAM, BinaryEncoder.default)
        .add(MediaType.WWW_URL_FORM_ENCODED, URLEncoder.default)
        .add(MediaType.CBOR, CBOREncoder.default);
    }

    build(): MediaTypeEncoders {
      return new MediaTypeEncoders(this.encoders);
    }
  };

  static DEFAULT: MediaTypeEncoders = new MediaTypeEncoders.Builder()
    .addDefaults()
    .build();

  constructor(private encoders: Map<string, MediaTypeEncoder>) {}

  supports(mediaType: string): boolean {
    return this.encoders.has(mediaType);
  }

  find(mediaType: string): MediaTypeEncoder {
    const encoder = this.encoders.get(mediaType);
    if (!encoder) {
      throw Error(`Unsupported media type - ${mediaType}`);
    }
    return encoder;
  }
}
