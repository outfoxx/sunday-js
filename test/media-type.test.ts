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

import { MediaType } from '../src';
import Suffix = MediaType.Suffix;
import Tree = MediaType.Tree;
import Type = MediaType.Type;

describe('MediaType', () => {
  describe('equality', () => {
    it('true when same objects', () => {
      const mediaType = MediaType.HTML.withParameter(
        MediaType.ParameterName.CharSet,
        'utf-8'
      );
      expect(mediaType.equals(mediaType)).toBeTrue();
    });

    it('true when equal objects', () => {
      const mediaType1 = MediaType.HTML.withParameter(
        MediaType.ParameterName.CharSet,
        'utf-8'
      ).withParameter('test', '123');
      const mediaType2 = MediaType.HTML.withParameter(
        MediaType.ParameterName.CharSet,
        'utf-8'
      ).withParameter('test', '123');

      expect(mediaType1.equals(mediaType2)).toBeTrue();
    });

    it('false when types are different', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const mediaType1 = MediaType.from('application/json')!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const mediaType2 = MediaType.from('text/json')!;

      expect(mediaType1.equals(mediaType2)).toBeFalse();
    });

    it('false when trees are different', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const mediaType1 = MediaType.from('application/x-html')!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const mediaType2 = MediaType.from('application/x.html')!;

      expect(mediaType1.equals(mediaType2)).toBeFalse();
    });

    it('false when subtypes are different', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const mediaType1 = MediaType.from('text/html')!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const mediaType2 = MediaType.from('text/json')!;

      expect(mediaType1.equals(mediaType2)).toBeFalse();
    });

    it('false when suffixes are different', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const mediaType1 = MediaType.from('application/problem+json')!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const mediaType2 = MediaType.from('application/problem+cbor')!;

      expect(mediaType1.equals(mediaType2)).toBeFalse();
    });

    it('false when any parameter is different', () => {
      const mediaType1 = MediaType.HTML.withParameter(
        MediaType.ParameterName.CharSet,
        'utf-8'
      ).withParameter('test', '456');
      const mediaType2 = MediaType.HTML.withParameter(
        MediaType.ParameterName.CharSet,
        'utf-8'
      ).withParameter('test', '123');

      expect(mediaType1.equals(mediaType2)).toBeFalse();
    });
  });

  describe('compatibility', () => {
    it('compatible when equal', () => {
      expect(
        new MediaType({
          type: Type.Text,
          tree: Tree.Vendor,
          subtype: 'plain',
          suffix: Suffix.JSON,
          parameters: {
            a: 'b',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            tree: Tree.Vendor,
            subtype: 'plain',
            suffix: Suffix.JSON,
            parameters: {
              a: 'b',
            },
          })
        )
      ).toBeTrue();
    });

    it('incompatible when different types', () => {
      expect(
        new MediaType({
          type: Type.Text,
          tree: Tree.Vendor,
          subtype: 'plain',
          suffix: Suffix.JSON,
          parameters: {
            a: 'b',
          },
        }).compatible(
          new MediaType({
            type: Type.Image,
            tree: Tree.Vendor,
            subtype: 'plain',
            suffix: Suffix.JSON,
            parameters: {
              a: 'b',
            },
          })
        )
      ).toBeFalse();
    });

    it('incompatible when different trees', () => {
      expect(
        new MediaType({
          type: Type.Text,
          tree: Tree.Vendor,
          subtype: 'plain',
          suffix: Suffix.JSON,
          parameters: {
            a: 'b',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            tree: Tree.Personal,
            subtype: 'plain',
            suffix: Suffix.JSON,
            parameters: {
              a: 'b',
            },
          })
        )
      ).toBeFalse();
    });

    it('incompatible when different subtypes', () => {
      expect(
        new MediaType({
          type: Type.Text,
          tree: Tree.Vendor,
          subtype: 'plain',
          suffix: Suffix.JSON,
          parameters: {
            a: 'b',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            tree: Tree.Vendor,
            subtype: 'html',
            suffix: Suffix.JSON,
            parameters: {
              a: 'b',
            },
          })
        )
      ).toBeFalse();
    });

    it('incompatible when different suffixes', () => {
      expect(
        new MediaType({
          type: Type.Text,
          tree: Tree.Vendor,
          subtype: 'plain',
          suffix: Suffix.JSON,
          parameters: {
            a: 'b',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            tree: Tree.Vendor,
            subtype: 'plain',
            suffix: Suffix.XML,
            parameters: {
              a: 'b',
            },
          })
        )
      ).toBeFalse();
    });

    it('incompatible when different parameter values', () => {
      expect(
        new MediaType({
          type: Type.Text,
          tree: Tree.Vendor,
          subtype: 'plain',
          suffix: Suffix.JSON,
          parameters: {
            a: 'b',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            tree: Tree.Vendor,
            subtype: 'plain',
            suffix: Suffix.JSON,
            parameters: {
              a: 'c',
            },
          })
        )
      ).toBeFalse();
    });

    it('incompatible when different parameter values (missing suffix)', () => {
      expect(
        new MediaType({
          type: Type.Text,
          tree: Tree.Vendor,
          subtype: 'plain',
          suffix: Suffix.JSON,
          parameters: {
            a: 'b',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            tree: Tree.Vendor,
            subtype: 'plain',
            parameters: {
              a: 'c',
            },
          })
        )
      ).toBeFalse();
    });

    it('compatible with different parameters', () => {
      expect(
        new MediaType({
          type: Type.Text,
          subtype: 'html',
          parameters: {
            'custom-charset': 'utf-16',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            subtype: 'html',
            parameters: {
              charset: 'utf-8',
            },
          })
        )
      ).toBeTrue();
    });

    it('compatible with different parameter cases', () => {
      expect(
        new MediaType({
          type: Type.Text,
          subtype: 'html',
          parameters: {
            charset: 'utf-8',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            subtype: 'html',
            parameters: {
              CHARSET: 'utf-8',
            },
          })
        )
      ).toBeTrue();
    });

    it('incompatible with different parameter values', () => {
      expect(
        new MediaType({
          type: Type.Text,
          subtype: 'html',
          parameters: {
            charset: 'utf-8',
          },
        }).compatible(
          new MediaType({
            type: Type.Text,
            subtype: 'html',
            parameters: {
              charset: 'utf-16',
            },
          })
        )
      ).toBeFalse();
    });

    it('compatible with wildcard type & subtype', () => {
      expect(
        new MediaType({
          type: Type.Text,
          subtype: 'html',
        }).compatible(
          new MediaType({
            type: Type.Any,
            subtype: '*',
          })
        )
      ).toBeTrue();
    });

    it('compatible with wildcard type', () => {
      expect(
        new MediaType({
          type: Type.Text,
          subtype: 'html',
        }).compatible(
          new MediaType({
            type: Type.Any,
            subtype: 'html',
          })
        )
      ).toBeTrue();
    });

    it('compatible with wildcard subtype', () => {
      expect(
        new MediaType({
          type: Type.Text,
          subtype: 'html',
        }).compatible(
          new MediaType({
            type: Type.Text,
            subtype: '*',
          })
        )
      ).toBeTrue();
    });
  });

  describe('parsing', () => {
    it('parses common', () => {
      expect(MediaType.from('application/problem+json;charset=utf-8')).toEqual(
        new MediaType({
          type: Type.Application,
          tree: Tree.Standard,
          subtype: 'problem',
          suffix: Suffix.JSON,
          parameters: { charset: 'utf-8' },
        })
      );
    });

    it('parses with non-standard tree', () => {
      expect(MediaType.from('application/x-www-form-urlencoded')).toEqual(
        new MediaType({
          type: Type.Application,
          tree: Tree.Obsolete,
          subtype: 'www-form-urlencoded',
        })
      );
    });

    it('parses with non-standard tree and complex subtype', () => {
      expect(MediaType.from('application/x-x509-ca-cert')).toEqual(
        new MediaType({
          type: Type.Application,
          tree: Tree.Obsolete,
          subtype: 'x509-ca-cert',
        })
      );
    });

    it('parses with multiple parameters', () => {
      expect(
        MediaType.from('application/vnd.yaml;charset=utf-8;something=else')
      ).toEqual(
        new MediaType({
          type: Type.Application,
          tree: Tree.Vendor,
          subtype: 'yaml',
          parameters: { charset: 'utf-8', something: 'else' },
        })
      );
    });

    it('parses with different cases', () => {
      expect(
        MediaType.from('APPLICATION/VND.YAML;CHARSET=UTF-8;SOMETHING=ELSE')
      ).toEqual(
        new MediaType({
          type: Type.Application,
          tree: Tree.Vendor,
          subtype: 'yaml',
          parameters: { charset: 'utf-8', something: 'else' },
        })
      );
    });

    it('parses with random spacing', () => {
      expect(
        MediaType.from(
          'APPLICATION/VND.YAML  ;  CHARSET=UTF-8 ; SOMETHING=ELSE   '
        )
      ).toEqual(
        new MediaType({
          type: Type.Application,
          tree: Tree.Vendor,
          subtype: 'yaml',
          parameters: { charset: 'utf-8', something: 'else' },
        })
      );
    });

    it('parses all known types', () => {
      expect(MediaType.from('application/*')?.type).toBe(
        MediaType.Type.Application
      );
      expect(MediaType.from('audio/*')?.type).toBe(MediaType.Type.Audio);
      expect(MediaType.from('example/*')?.type).toBe(MediaType.Type.Example);
      expect(MediaType.from('font/*')?.type).toBe(MediaType.Type.Font);
      expect(MediaType.from('image/*')?.type).toBe(MediaType.Type.Image);
      expect(MediaType.from('message/*')?.type).toBe(MediaType.Type.Message);
      expect(MediaType.from('model/*')?.type).toBe(MediaType.Type.Model);
      expect(MediaType.from('multipart/*')?.type).toBe(
        MediaType.Type.Multipart
      );
      expect(MediaType.from('text/*')?.type).toBe(MediaType.Type.Text);
      expect(MediaType.from('video/*')?.type).toBe(MediaType.Type.Video);
      expect(MediaType.from('*/*')?.type).toBe(MediaType.Type.Any);
    });

    it('parses all known trees', () => {
      expect(MediaType.from('text/html')?.tree).toBe(MediaType.Tree.Standard);
      expect(MediaType.from('text/vnd.html')?.tree).toBe(MediaType.Tree.Vendor);
      expect(MediaType.from('text/prs.html')?.tree).toBe(
        MediaType.Tree.Personal
      );
      expect(MediaType.from('text/x.html')?.tree).toBe(
        MediaType.Tree.Unregistered
      );
      expect(MediaType.from('text/x-html')?.tree).toBe(MediaType.Tree.Obsolete);
    });

    it('parses all known suffixes', () => {
      expect(MediaType.from('application/test+xml')?.suffix).toBe(
        MediaType.Suffix.XML
      );
      expect(MediaType.from('application/test+json')?.suffix).toBe(
        MediaType.Suffix.JSON
      );
      expect(MediaType.from('application/test+ber')?.suffix).toBe(
        MediaType.Suffix.BER
      );
      expect(MediaType.from('application/test+der')?.suffix).toBe(
        MediaType.Suffix.DER
      );
      expect(MediaType.from('application/test+fastinfoset')?.suffix).toBe(
        MediaType.Suffix.FastInfoSet
      );
      expect(MediaType.from('application/test+wbxml')?.suffix).toBe(
        MediaType.Suffix.WBXML
      );
      expect(MediaType.from('application/test+zip')?.suffix).toBe(
        MediaType.Suffix.Zip
      );
      expect(MediaType.from('application/test+cbor')?.suffix).toBe(
        MediaType.Suffix.CBOR
      );
    });
  });

  describe('formatting', () => {
    it('formats correctly', () => {
      expect(
        new MediaType({
          type: Type.Application,
          tree: Tree.Vendor,
          subtype: 'yaml',
          parameters: { charset: 'utf-8', something: 'else' },
        }).toString()
      ).toEqual('application/vnd.yaml;charset=utf-8;something=else');
    });
  });

  describe('parameters', () => {
    it('access', () => {
      const mediaType = MediaType.HTML.withParameter(
        'charset',
        'utf-8'
      ).withParameter('test', '123');

      expect(mediaType.parameter('charset')).toBe('utf-8');
      expect(mediaType.parameter('test')).toBe('123');
      expect(mediaType.parameter('none')).toBeUndefined();
    });

    it('override', () => {
      expect(
        MediaType.HTML.withParameter('a', '123')
          .withParameter('a', '456')
          .parameter('a')
      ).toBe('456');

      expect(
        MediaType.HTML.withParameter('a', '456')
          .withParameter('a', '123')
          .parameter('a')
      ).toBe('123');
    });
  });
});
