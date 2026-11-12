//! Compatibility for comrak-wasm's existing serialized AST contract.
use crate::nodes::{Ast, BlockLines, NodeCode, NodeTaskItem, NodeValue, Sourcepos};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub(crate) struct AstWire {
    value: NodeValue,
    sourcepos: Sourcepos,
    #[serde(default)]
    content: String,
    #[serde(default)]
    line_offsets: Vec<usize>,
    #[serde(default)]
    open: bool,
    #[serde(default)]
    last_line_blank: bool,
    #[serde(default)]
    table_visited: bool,
    #[cfg(feature = "attributes")]
    #[serde(default)]
    attrs: Option<Box<crate::nodes::Attributes>>,
    #[serde(default)]
    lines: Option<Box<BlockLines>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    task_item_sourcepos: Option<Sourcepos>,
}

impl From<Ast> for AstWire {
    fn from(ast: Ast) -> Self {
        let task_item_sourcepos = match &ast.value {
            NodeValue::TaskItem(item) => Some(item.symbol_sourcepos),
            _ => None,
        };
        Self {
            content: ast
                .lines
                .as_ref()
                .map(|lines| lines.content.clone())
                .unwrap_or_default(),
            line_offsets: ast
                .lines
                .as_ref()
                .map(|lines| lines.offsets.to_vec())
                .unwrap_or_default(),
            value: ast.value,
            sourcepos: ast.sourcepos,
            open: ast.open,
            last_line_blank: ast.last_line_blank,
            table_visited: ast.table_visited,
            #[cfg(feature = "attributes")]
            attrs: ast.attrs,
            lines: ast.lines,
            task_item_sourcepos,
        }
    }
}

impl From<AstWire> for Ast {
    fn from(mut wire: AstWire) -> Self {
        if let NodeValue::TaskItem(item) = &mut wire.value {
            if let Some(sourcepos) = wire.task_item_sourcepos {
                item.symbol_sourcepos = sourcepos;
            }
        }
        let lines = wire.lines.or_else(|| {
            if wire.content.is_empty() && wire.line_offsets.is_empty() {
                None
            } else {
                Some(Box::new(BlockLines {
                    content: wire.content,
                    offsets: wire.line_offsets.into(),
                }))
            }
        });
        Self {
            value: wire.value,
            sourcepos: wire.sourcepos,
            open: wire.open,
            last_line_blank: wire.last_line_blank,
            table_visited: wire.table_visited,
            #[cfg(feature = "attributes")]
            attrs: wire.attrs,
            lines,
        }
    }
}

#[derive(Serialize, Deserialize)]
pub(crate) struct CodeWire {
    literal: String,
    // Kept for callers of the original TypeScript Code interface.
    #[serde(default)]
    info: String,
    #[serde(default = "one_backtick")]
    num_backticks: usize,
}

fn one_backtick() -> usize {
    1
}

impl From<NodeCode> for CodeWire {
    fn from(code: NodeCode) -> Self {
        Self {
            literal: code.literal,
            num_backticks: code.num_backticks,
            info: String::new(),
        }
    }
}

impl From<CodeWire> for NodeCode {
    fn from(wire: CodeWire) -> Self {
        Self {
            literal: wire.literal,
            num_backticks: wire.num_backticks,
        }
    }
}

pub(crate) mod task_item {
    use super::*;

    pub(crate) fn serialize<S: serde::Serializer>(
        item: &NodeTaskItem,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        item.symbol.serialize(serializer)
    }

    pub(crate) fn deserialize<'de, D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> Result<NodeTaskItem, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Wire {
            Legacy(Option<char>),
            Current(NodeTaskItem),
        }
        Ok(match Wire::deserialize(deserializer)? {
            Wire::Legacy(symbol) => NodeTaskItem {
                symbol,
                symbol_sourcepos: (0, 0, 0, 0).into(),
            },
            Wire::Current(item) => item,
        })
    }
}
