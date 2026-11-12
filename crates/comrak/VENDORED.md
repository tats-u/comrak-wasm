# Comrak source and local compatibility patch

Upstream: https://github.com/kivikakk/comrak

Release: **v0.59.0**, commit `ac9d2081fe21b151ad3b3e42fea0e870e6272999`.

This directory contains the upstream `Cargo.toml`, `build.rs`, `COPYING`,
`README.md`, `CHANGELOG.md`, `rustfmt.toml`, `src`, `examples`, and `benches`.
The upstream BSD license is in `COPYING`.

The former `nberlette/comrak-labs` `feat/serde` submodule was required for AST
and option serialization, but tied upgrades to commits published in that fork.
This remains a locally maintained fork: upstream 0.59.0 has no equivalent
serde/AST serialization feature. The source is now checked in so a fresh clone can build without submodule setup
or unpublished fork commits. `../../patches/comrak-wasm.patch` records the
complete difference from the upstream files listed above.

Local changes:

- Opt-in serde implementations for options, node metadata, heading metadata and
  the flat indexed AST wire format, adapted from comrak-labs commit
  `657f4fe196947fe083fd017ef2c648ff628ff2b2` (Nicholas Berlette).
- Camel-case option names and callback/plugin fields skipped by serde.
- Owned escaped-tag strings, enabling AST deserialization.
- Compatible AST wire metadata and legacy checkbox values in `src/wasm_serde.rs`;
  new checkbox source spans are exposed as additional node metadata.
- The legacy opt-in `tagfilter` extension, retained for existing callers after
  upstream removed it. This is not a sanitizer; safe rendering still defaults
  to omitting raw HTML.

To update: export the same file list from the next upstream release into a
fresh temporary directory, apply `patches/comrak-wasm.patch` with `patch -p1`,
and resolve any changed metadata or option fields there. Replace this directory's
upstream files with the result; retain this provenance file. Update the release,
commit, workspace dependency/package versions, Deno version and TypeScript types
and defaults. Regenerate the patch against the pristine upstream export and run:

```sh
cargo test -p comrak --lib --no-default-features \
  --features serialization,shortcodes,attributes,phoenix_heex
deno task build
deno task test
deno task fmt:check
deno task lint
```

The patch is deliberately separate from the source snapshot to make future
upstream differences reviewable. New fields and node variants must be tested
through both direct rendering and AST parse/render round trips.
