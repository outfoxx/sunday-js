import { MediaType } from '../media-type';
import { BinaryEncoder } from './binary-encoder';
import { CBOREncoder } from './cbor-encoder';
import { JSONEncoder } from './json-encoder';
import { MediaTypeEncoder } from './media-type-encoder';
import { WWWFormUrlEncoder } from './www-form-url-encoder';

export interface MediaTypeEncodersBuilder {
  addDefaults(): MediaTypeEncodersBuilder;

  add(
    mediaType: MediaType,
    encoder: MediaTypeEncoder
  ): MediaTypeEncodersBuilder;

  build(): MediaTypeEncoders;
}
export interface MediaTypeEncodersBuilderConstructor {
  new (): MediaTypeEncodersBuilder;
}

export class MediaTypeEncoders {
  static Builder: MediaTypeEncodersBuilderConstructor = class Builder
    implements MediaTypeEncodersBuilder {
    encoders = new Map<MediaType, MediaTypeEncoder>();

    add(
      mediaType: MediaType,
      encoder: MediaTypeEncoder
    ): MediaTypeEncodersBuilder {
      this.encoders.set(mediaType, encoder);
      return this;
    }

    addDefaults(): MediaTypeEncodersBuilder {
      return this.add(MediaType.JSON, JSONEncoder.default)
        .add(MediaType.OctetStream, BinaryEncoder.default)
        .add(MediaType.WWWFormUrlEncoded, WWWFormUrlEncoder.default)
        .add(MediaType.CBOR, CBOREncoder.default);
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
    return Array.from(this.encoders.keys()).some((key) =>
      key.compatible(mediaType)
    );
  }

  find(mediaType: MediaType): MediaTypeEncoder {
    const found = Array.from(this.encoders.entries()).find(([type]) =>
      type.compatible(mediaType)
    );
    if (!found) {
      throw Error(`Unsupported media type - ${mediaType}`);
    }
    return found[1];
  }
}
