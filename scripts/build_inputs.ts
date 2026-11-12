/** Hash all inputs that can change the generated Wasm bindings. */
export async function buildInputsHash(): Promise<string> {
  const paths = [
    "Cargo.toml",
    "Cargo.lock",
    "deno.json",
    "deno.lock",
    "rust-toolchain.toml",
  ];
  async function visit(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) await visit(path);
      else if (/\.(rs|toml|ts)$/.test(path)) paths.push(path);
    }
  }
  await visit("crates/comrak");
  await visit("crates/comrak-wasm");
  await visit("scripts");
  const inputs = await Promise.all(
    paths.sort().map(async (path) =>
      `${path}\0${await Deno.readTextFile(path)}`
    ),
  );
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(inputs.join("\0")),
  );
  return Array.from(
    new Uint8Array(hash),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

if (import.meta.main) {
  try {
    await Deno.stat("src/lib/comrak_wasm.js");
    await Deno.stat("src/lib/comrak_wasm.d.ts");
    Deno.exit(
      (await Deno.readTextFile("src/lib/build-inputs.txt")).trim() ===
          await buildInputsHash()
        ? 0
        : 1,
    );
  } catch {
    Deno.exit(1);
  }
}
