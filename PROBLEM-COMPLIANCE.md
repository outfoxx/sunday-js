# RFC 9457 standard members

Problem codecs normalize null and wrong JSON categories to absence at individual properties. `ProblemStringSchema`, `ProblemStatusSchema`, `ProblemReferenceSchema`, and `ProblemTypeSchema` compose inside `ProblemWireSchema.extend(...)`. Use `createProblemReferenceCodec` to combine string constraints with URI conversion. Defaults belong after normalization. Correctly typed values still undergo constraints; a broad `.catch()` would incorrectly hide their errors.

The schemas support `.parse()`, `.decode()`, `.safeParse()`, and `.encode()`. Reverse conversion validates application values and omits absent keys, while retaining nullable extensions and empty strings. Extension fields retain their own schemas and nested contents are unchanged.

## API changes

`Problem.title` and `Problem.status` are optional. Standalone `{}` decoding yields `about:blank` without invented title/status. Check presence before using either field. Status helpers no longer assume status is present.

`type` and `instance` support `URL | string`: absolute URIs become URLs only when conversion preserves the exact wire string; otherwise they remain strings, as do relative and empty references. Use `.toString()` for either representation; narrow with `instanceof URL` before accessing URL-specific properties. Constructors accept either representation. This representation change is confined to Problems.

Transport registration uses the effective type: missing, null, or wrong-typed type means `about:blank`. Valid body status takes precedence over response status. HTTP default titles apply only to `about:blank`; custom types can define their own property defaults. Invalid required extensions still fail.

Regenerated Problems require Sunday 2.0.0-beta.16 or later. `createProblemUnionCodec` normalizes only the type used for branch selection; each branch retains extension validation. Ordinary model schemas retain their existing behavior. Reference: [RFC 9457 §3.1](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.1) and [Zod codecs](https://zod.dev/codecs).
