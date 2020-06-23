import { BinaryDecoder } from './binary-decoder';
import { JSONDecoder } from './json-decoder';
import { MediaType } from './media-type';
import { MediaTypeDecoder } from './media-type-decoder';

export class MediaTypeDecoders {
  static Builder = class Builder {
    decoders = new Map<string, MediaTypeDecoder>();

    add(mediaType: string, encoder: MediaTypeDecoder): Builder {
      this.decoders.set(mediaType, encoder);
      return this;
    }

    addDefaults(): Builder {
      return this.add(MediaType.JSON, JSONDecoder.default).add(
        MediaType.OCTET_STREAM,
        new BinaryDecoder()
      );
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
