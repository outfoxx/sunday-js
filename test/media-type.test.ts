import { MediaType } from '../src';
import Suffix = MediaType.Suffix;
import Tree = MediaType.Tree;
import Type = MediaType.Type;

describe('MediaType', () => {
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
});
