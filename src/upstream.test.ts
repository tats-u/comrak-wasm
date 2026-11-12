import assert from "node:assert/strict";
import { test } from "node:test";
import {
  markdownToCommonMark,
  markdownToHTML,
  markdownToXML,
  Options,
  parseMarkdown,
  renderCommonMark,
  renderHTML,
  renderXML,
} from "../mod.ts";
import { default_options, version } from "./_wasm.ts";

test("uses Comrak 0.59.0 and keeps public option defaults in sync", () => {
  assert.equal(version(), "0.59.0");
  const defaults = Options.default();
  const rust = default_options() as Record<
    "extension" | "parse" | "render",
    Record<string, unknown>
  >;
  for (const group of ["extension", "parse", "render"] as const) {
    for (const [key, value] of Object.entries(rust[group])) {
      // serde-wasm-bindgen maps None to undefined; public options use null.
      assert.deepEqual(
        defaults[group][key as keyof typeof defaults[typeof group]],
        value ?? null,
        `${group}.${key}`,
      );
    }
  }
});

test("new extensions work through direct rendering and AST round trips", () => {
  const cases = [
    { md: "++added++", extension: { insert: true }, html: "<ins>added</ins>" },
    {
      md: "\\(a + b\\)",
      extension: { mathLatex: true },
      html: 'data-math-style="inline"',
    },
    {
      md: "visible %%hidden%% text",
      extension: { ofmComments: true },
      html: "visible  text",
    },
    { md: "%%\nhidden\n%%", extension: { ofmComments: true }, html: "" },
    {
      md: "> [!warning]- Custom title\n> Watch out",
      extension: { ofmCallouts: true },
      html: 'data-callout="warning"',
    },
    {
      md: ":::warning\nWatch out\n:::",
      extension: { blockDirective: true },
      html: '<div class="warning">',
    },
    {
      md: "==marked==",
      extension: { highlight: true },
      html: "<mark>marked</mark>",
    },
    { md: "- [x] done", extension: { tasklist: true }, html: 'checked=""' },
    {
      md: "![[image.png]]",
      extension: { wikilinksTitleAfterPipe: true, wikilinksIgnoreEmbeds: true },
      html: "![[image.png]]",
    },
    {
      md: "<%= @name %>",
      extension: { phoenixHeex: true },
      html: "<%= @name %>",
    },
  ];
  for (const { md, extension, html } of cases) {
    const options = { extension };
    const ast = parseMarkdown(md, options);
    const direct = markdownToHTML(md, options);
    assert.ok(direct.includes(html), direct);
    if (extension.ofmComments) assert.ok(!direct.includes("hidden"));
    assert.equal(renderHTML(ast, options), direct, md);
    assert.equal(renderXML(ast, options), markdownToXML(md, options), md);
    assert.equal(
      renderCommonMark(ast, options),
      markdownToCommonMark(md, options),
      md,
    );
  }
});

test("attributes are available on AST nodes", () => {
  const options = {
    extension: {
      headerAttributes: true,
      inlineCodeAttributes: true,
      fencedCodeAttributes: true,
      linkAttributes: true,
    },
  };
  const ast = parseMarkdown(
    "# Title {#title .main}\n\n`code`{.inline}\n\n```js {.fenced}\ncode\n```\n\n[link](url){.link}",
    options,
  );
  const attrs = ast.nodes.map((node) => node.data.attrs).filter(Boolean);
  assert.ok(attrs.some((attr) => attr?.id === "title"));
  for (const name of ["main", "inline", "fenced", "link"]) {
    assert.ok(attrs.some((attr) => attr?.classes.includes(name)), name);
  }
  assert.equal(
    renderHTML(ast, options),
    markdownToHTML(
      "# Title {#title .main}\n\n`code`{.inline}\n\n```js {.fenced}\ncode\n```\n\n[link](url){.link}",
      options,
    ),
  );
});

test("new rendering, heading and source position options", () => {
  assert.equal(
    markdownToHTML("# Hello\n\nWorld.", { render: { compactHtml: true } }),
    "<h1>Hello</h1><p>World.</p>",
  );
  assert.ok(
    markdownToHTML("> [!NOTE]\n> Text", {
      extension: { alerts: true },
      render: { alertStyle: "semantic" },
    }).includes('<aside class="admonition note">'),
  );
  const html = markdownToHTML("# Title", {
    extension: { headerIdPrefix: "doc-", headerIdPrefixInHref: true },
  });
  assert.ok(html.includes('id="doc-title"'));
  assert.ok(html.includes('href="#doc-title"'));
  const ast = parseMarkdown("好", { parse: { sourceposChars: true } });
  assert.equal(ast.nodes[1]?.data.sourcepos?.end.column, 1);
});

test("codefence renderers receive metadata and replace the entire block", () => {
  const options = {
    plugins: {
      render: {
        codefenceRenderers: {
          mermaid(lang: string, meta: string, code: string) {
            assert.equal(lang, "mermaid");
            assert.equal(meta, "title=Example");
            return `<figure>${code}</figure>`;
          },
        },
      },
    },
  };
  const md = "```mermaid title=Example\ngraph LR\n```";
  assert.equal(markdownToHTML(md, options), "<figure>graph LR\n</figure>");
  assert.equal(
    renderHTML(parseMarkdown(md), options),
    markdownToHTML(md, options),
  );
  assert.ok(markdownToHTML("```js\ncode\n```", options).includes("<pre><code"));
});

test("parsing can be cancelled from JavaScript", () => {
  const md = "# Heading\n\nParagraph.\n\n".repeat(10000);
  const options = { parse: { shouldCancel: () => true } };
  assert.throws(() => parseMarkdown(md, options), /parse cancelled/);
  assert.throws(() => markdownToHTML(md, options), /parse cancelled/);
  assert.ok(
    markdownToHTML("hello", { parse: { shouldCancel: () => false } }).includes(
      "hello",
    ),
  );
});

test("0.48 ASTs and public metadata remain usable", async () => {
  const fixture = JSON.parse(
    await Deno.readTextFile(
      new URL("./fixtures/ast-0.48.json", import.meta.url),
    ),
  );
  assert.equal(renderHTML(fixture.ast, fixture.options), fixture.html);
  assert.equal(
    renderCommonMark(fixture.ast, fixture.options),
    fixture.commonmark,
  );
  assert.equal(
    renderXML(fixture.ast, fixture.options),
    markdownToXML(fixture.markdown, fixture.options),
  );
  const ast = parseMarkdown(fixture.markdown, fixture.options);
  for (const { data } of ast.nodes) {
    assert.equal(typeof data.content, "string");
    assert.ok(Array.isArray(data.line_offsets));
  }
  const tasks = ast.nodes.filter((node) =>
    typeof node.data.value === "object" && "TaskItem" in node.data.value
  );
  assert.equal(tasks.length, 2);
  for (const node of tasks) assert.ok(node.data.task_item_sourcepos);
  assert.ok(
    tasks.some((node) =>
      "TaskItem" in node.data.value && node.data.value.TaskItem === "x"
    ),
  );
  const code = ast.nodes.find((node) =>
    typeof node.data.value === "object" && "Code" in node.data.value
  );
  assert.ok(code && "Code" in code.data.value);
  assert.equal(code.data.value.Code.info, "");
});
