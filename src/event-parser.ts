export interface EventInfo {
  id?: string;
  event?: string;
  data?: string;
  retry?: string;
}

export class EventParser {
  private decoder: TextDecoder = new TextDecoder('utf-8');
  private unprocessedBuffer?: ArrayBuffer;

  process(
    buffer: ArrayBuffer,
    dispatcher: (eventInfo: EventInfo) => void
  ): void {
    const availableBuffer = this.buildAvailableBuffer(buffer);
    if (!availableBuffer) {
      return;
    }

    const eventStrings = this.extractEventStringsFromBuffer(availableBuffer);

    if (!eventStrings.length) {
      return;
    }

    EventParser.parseAndDispatchEvents(eventStrings, dispatcher);
  }

  private buildAvailableBuffer(buffer: ArrayBuffer): ArrayBuffer | undefined {
    const unprocessedBuffer = this.unprocessedBuffer;
    this.unprocessedBuffer = undefined;

    if (!buffer.byteLength) {
      return unprocessedBuffer;
    } else if (!unprocessedBuffer?.byteLength) {
      return buffer;
    }

    const newBuffer = new Uint8Array(
      unprocessedBuffer.byteLength + buffer.byteLength
    );
    newBuffer.set(new Uint8Array(unprocessedBuffer), 0);
    newBuffer.set(new Uint8Array(buffer), unprocessedBuffer.byteLength);

    return newBuffer.buffer;
  }

  private extractEventStringsFromBuffer(buffer: ArrayBuffer): string[] {
    const eventStrings: string[] = [];

    while (buffer.byteLength) {
      // Find end of next event separator in buffer, exiting if none found.
      const eventSeparator = this.findEventSeparator(buffer);
      if (!eventSeparator) {
        // Save unprocessed data
        this.unprocessedBuffer = buffer;
        break;
      }

      const [endOfCurrentEventIdx, startOfNextEventIdx] = eventSeparator;

      const eventBuffer = buffer.slice(0, endOfCurrentEventIdx);
      buffer = buffer.slice(startOfNextEventIdx);

      const eventString = this.decoder.decode(eventBuffer, {
        stream: true,
      });

      eventStrings.push(eventString);
    }

    return eventStrings;
  }

  private findEventSeparator(
    buffer: ArrayBuffer
  ): [number, number] | undefined {
    const bytes = new Uint8Array(buffer);

    for (let idx = 0; idx < bytes.length; ++idx) {
      const byte = bytes[idx];

      switch (byte) {
        // line-feed
        case 0xa: {
          // if next byte is same,
          // we found a separator
          if (bytes[idx + 1] == 0xa) {
            return [idx, idx + 2];
          }
          break;
        }

        // carriage-return
        case 0xd: {
          // if next byte is same,
          // we found a separator
          if (bytes[idx + 1] == 0xd) {
            return [idx, idx + 2];
          }

          // if next is line-feed, and pattern
          // repeats, we found a separator.
          if (
            bytes[idx + 1] == 0xa &&
            bytes[idx + 2] == 0xd &&
            bytes[idx + 3] == 0xa
          ) {
            return [idx, idx + 4];
          }

          break;
        }

        default:
          continue;
      }
    }
    return undefined;
  }

  private static parseAndDispatchEvents(
    eventStrings: string[],
    dispatcher: (eventInfo: EventInfo) => void
  ) {
    for (const eventString of eventStrings) {
      if (!eventString.length) {
        continue;
      }

      const parsedEvent = EventParser.parseEvent(eventString);

      dispatcher(parsedEvent);
    }
  }

  private static parseEvent(eventString: string): EventInfo {
    const event: EventInfo = {};

    for (const line of eventString.split(lineSeparatorsRegEx)) {
      const keyValueSeparatorIdx = line.indexOf(':');

      let key: string;
      let value: string;
      if (keyValueSeparatorIdx != -1) {
        key = line.slice(0, keyValueSeparatorIdx);
        value = line.slice(keyValueSeparatorIdx + 1);
      } else {
        key = line;
        value = '';
      }

      switch (key) {
        case 'retry':
          event.retry = EventParser.trimFieldValue(value);
          break;

        case 'data': {
          const data = event.data ?? '';
          event.data = `${data}${EventParser.trimFieldValue(value)}\n`;
          break;
        }

        case '':
          // comment do nothing
          break;

        default: {
          (event as Record<string, string>)[key] = EventParser.trimFieldValue(
            value
          );
        }
      }
    }

    if (event.data?.[event.data?.length - 1] == '\n') {
      event.data = event.data.slice(0, -1);
    }

    return event;
  }

  private static trimFieldValue(value: string): string {
    if (value[0] != ' ') {
      return value;
    }
    return value.slice(1);
  }
}

const lineSeparatorsRegEx = /\r\n|\r|\n/;
