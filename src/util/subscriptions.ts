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

export interface Unsubscribable {
  unsubscribe(): void;
}

export interface SubscriptionLike extends Unsubscribable {
  readonly closed: boolean;
  readonly done: Promise<void>;
}

export class Subscription implements SubscriptionLike {
  private readonly _collection = new Set<Unsubscribable>();
  private readonly _done = Promise.withResolvers<void>();
  closed = false;

  add(sub: (() => unknown) | Unsubscribable): void {
    let unsub: Unsubscribable;
    if (typeof sub == 'function') {
      unsub = {
        unsubscribe: sub,
      };
    } else if (Object.hasOwn(sub, 'unsubscribe')) {
      unsub = sub;
    } else {
      throw new TypeError('Invalid argument');
    }
    this._collection.add(unsub);
  }

  remove(sub: (() => void) | Unsubscribable): void {
    let unsub: Unsubscribable | undefined = undefined;
    if (typeof sub == 'function') {
      for (const curUnsub of this._collection) {
        if (curUnsub.unsubscribe === sub) {
          unsub = curUnsub;
          break;
        }
      }
      if (!unsub) {
        return;
      }
    } else if (Object.hasOwn(sub, 'unsubscribe')) {
      unsub = sub;
    } else {
      throw new TypeError('Invalid argument');
    }
    this._collection.delete(unsub);
  }

  unsubscribe(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    try {
      this._collection.forEach((sub) => {
        try {
          sub.unsubscribe();
        }
        catch {
          // Ensure all subscriptions are attempted even if any `unsubscribe` fails.
        }
      });
    }
    finally {
      this._collection.clear();
      this._done.resolve();
    }
  }

  get done(): Promise<void> {
    return this._done.promise;
  }
}
