use serde::Deserialize;
use std::{env, fs, path::PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind")]
enum IrNode {
    #[serde(rename = "text")]
    Text { value: String },
    #[serde(rename = "dynamic")]
    Dynamic { hint: Option<String> },
    #[serde(rename = "fragment")]
    Fragment { children: Vec<IrNode> },
    #[serde(rename = "element")]
    Element {
        tag: String,
        #[serde(default)]
        props: serde_json::Map<String, serde_json::Value>,
        #[serde(default)]
        children: Vec<IrNode>,
    },
}

#[derive(Debug, Clone, Deserialize, Default)]
struct IrStateDefinition {
    id: String,
    #[serde(default)]
    setter: Option<String>,
    kind: String,
    source: String,
    initial: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct IrStateBinding {
    #[serde(rename = "stateId")]
    state_id: String,
    access: String,
    scope: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct IrStateAction {
    id: String,
    #[serde(rename = "stateId")]
    state_id: String,
    setter: String,
    operation: String,
    scope: String,
    #[serde(default)]
    argument: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct IrComponentBinding {
    component: String,
    index: usize,
    target: String,
    #[serde(rename = "stateId")]
    state_id: String,
    #[serde(default)]
    prefix: Option<String>,
    #[serde(default)]
    suffix: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct IrComponentAction {
    component: String,
    index: usize,
    target: String,
    #[serde(rename = "eventName")]
    event_name: String,
    #[serde(rename = "actionId")]
    action_id: String,
    #[serde(rename = "stateId")]
    state_id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct DesktopIrPage {
    route: String,
    source: String,
    #[serde(default)]
    state: Vec<IrStateDefinition>,
    #[serde(default)]
    bindings: Vec<IrStateBinding>,
    #[serde(default)]
    actions: Vec<IrStateAction>,
    #[serde(default)]
    #[serde(rename = "componentBindings")]
    component_bindings: Vec<IrComponentBinding>,
    #[serde(default)]
    #[serde(rename = "componentActions")]
    component_actions: Vec<IrComponentAction>,
    tree: IrNode,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum DesktopIrInput {
    Document(DesktopIrDocument),
    Node(IrNode),
}

#[derive(Debug, Clone, Deserialize)]
struct DesktopIrDocument {
    kind: String,
    entry: String,
    #[serde(default)]
    #[serde(rename = "initialRoute")]
    initial_route: Option<String>,
    #[serde(default)]
    state: Vec<IrStateDefinition>,
    #[serde(default)]
    bindings: Vec<IrStateBinding>,
    #[serde(default)]
    actions: Vec<IrStateAction>,
    #[serde(default)]
    #[serde(rename = "componentBindings")]
    component_bindings: Vec<IrComponentBinding>,
    #[serde(default)]
    #[serde(rename = "componentActions")]
    component_actions: Vec<IrComponentAction>,
    #[serde(default)]
    pages: Vec<DesktopIrPage>,
    tree: IrNode,
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let ir_path = manifest_dir.join("adaptive").join("app.ir.json");

    println!("cargo:rerun-if-changed={}", ir_path.display());

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let generated_path = out_dir.join("generated_ui.rs");

    let ir_json = match fs::read_to_string(&ir_path) {
        Ok(content) => content,
        Err(_) => {
            eprintln!(
                "[adaptive/build.rs] IR file not found at {}. Using fallback UI.",
                ir_path.display()
            );

            r#"{
  "kind": "fragment",
  "children": [
    { "kind": "text", "value": "Adaptive Desktop Fallback" },
    { "kind": "text", "value": "Run: npm run adaptive:build:desktop" }
  ]
}"#
            .to_string()
        }
    };

    let rust_code = match serde_json::from_str::<DesktopIrInput>(&ir_json) {
        Ok(DesktopIrInput::Document(document)) => generate_iced_code(&document.tree, &document),
        Ok(DesktopIrInput::Node(ir)) => generate_iced_code(&ir, &fallback_document()),
        Err(error) => {
            eprintln!(
                "[adaptive/build.rs] Failed to parse IR JSON at {}: {}. Using parse-error fallback UI.",
                ir_path.display(),
                error
            );
            generate_parse_error_code(&ir_json, &error.to_string())
        }
    };

    fs::write(&generated_path, rust_code).unwrap_or_else(|_| {
        panic!(
            "failed to write generated file: {}",
            generated_path.display()
        )
    });
}

fn generate_iced_code(ir: &IrNode, document: &DesktopIrDocument) -> String {
    let state_struct = generate_state_struct(document);
    let page_enum = generate_page_enum(document);
    let message_enum = generate_message_enum(document);
    let navigation_helpers = generate_navigation_helpers(document);
    let update_impl = generate_update_impl(document);
    let render_impl = generate_render_impl(ir, document);

    format!(
        r#"{state_struct}

{page_enum}

{message_enum}

{navigation_helpers}

{update_impl}

{render_impl}
"#
    )
}

fn generate_parse_error_code(ir_json: &str, error: &str) -> String {
    let escaped_json = rust_string_literal(ir_json);
    let escaped_error = rust_string_literal(error);

    format!(
        r#"#[derive(Debug, Clone)]
pub struct GeneratedState;

impl GeneratedState {{
    pub fn new() -> Self {{
        Self
    }}
}}

#[derive(Debug, Clone)]
pub enum GeneratedMessage {{
    Noop,
}}

pub fn update_generated(_: &GeneratedState, _: &GeneratedMessage) {{}}

pub fn render_ui<'a>(_: &GeneratedState) -> iced::Element<'a, GeneratedMessage> {{
    let content = crate::adaptive::layout::column(vec![
        crate::adaptive::components::text_node("Adaptive Desktop"),
        crate::adaptive::components::text_node("Failed to parse app.ir.json"),
        crate::adaptive::components::text_node({escaped_error}),
        crate::adaptive::components::text_node({escaped_json})
    ], 12);

    crate::adaptive::runtime::root(content)
}}
"#
    )
}

fn generate_render_impl(ir: &IrNode, document: &DesktopIrDocument) -> String {
    let pages = effective_pages(document, ir);
    let match_arms = pages
        .iter()
        .map(|page| {
            let mut render_context = RenderContext::default();
            let body = render_node(&page.tree, 3, document, &mut render_context);
            format!(
                "        GeneratedPage::{} => {{\n            let content = {{\n{body}\n            }};\n            crate::adaptive::runtime::root(content)\n        }}",
                page_variant_name(&page.route)
            )
        })
        .collect::<Vec<_>>()
        .join(",\n");

    format!(
        r#"pub fn render_ui<'a>(page: &GeneratedPage, state: &GeneratedState) -> iced::Element<'a, GeneratedMessage> {{
    match page {{
{match_arms}
    }}
}}"#
    )
}

#[derive(Default)]
struct RenderContext {
    text_component_index: usize,
    button_component_index: usize,
}

fn render_node(
    node: &IrNode,
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    match node {
        IrNode::Text { value } => render_text_element(value, indent),
        IrNode::Dynamic { hint } => {
            let label = hint
                .as_deref()
                .map(|value| format!("[dynamic] {}", value))
                .unwrap_or_else(|| "[dynamic]".to_string());
            render_text_element(&label, indent)
        }
        IrNode::Fragment { children } => {
            render_children_as_column(children, indent, document, render_context)
        }
        IrNode::Element {
            tag,
            props,
            children,
        } => render_element(tag, props, children, indent, document, render_context),
    }
}

fn render_element(
    tag: &str,
    props: &serde_json::Map<String, serde_json::Value>,
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    match tag {
        "row" => render_row(children, props, indent, document, render_context),
        "column" => render_column(children, props, indent, document, render_context),
        "button" => render_button(props, children, indent, document, render_context),
        "input" => render_input(props, indent),
        "text" | "span" | "label" | "p" => render_text(props, children, indent, document, render_context),
        "heading" => {
            let value = extract_text_from_children(children);
            render_heading(props, &value, indent)
        }
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            let value = extract_text_from_children(children);
            render_text_element(&value, indent)
        }
        "link" | "a" => render_link(props, children, indent, document),
        "spacer" => render_spacer(props, indent),
        "container" | "surface" | "card" | "div" | "main" | "section" | "article" | "form"
        | "nav" => render_container(children, props, indent, document, render_context),
        _ => render_unknown_element(tag, children, indent, document, render_context),
    }
}

fn render_row(
    children: &[IrNode],
    props: &serde_json::Map<String, serde_json::Value>,
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    let pad = " ".repeat(indent);
    let child_lines = render_child_lines(children, indent + 4, document, render_context);
    let spacing = first_style_u16_prop(props, &["gap", "spacing"])
        .or_else(|| first_u16_prop(props, &["spacing"]))
        .unwrap_or(12);

    format!(
        r#"{pad}crate::adaptive::layout::row(vec![
{child_lines}
{pad}], {spacing})"#
    )
}

fn render_column(
    children: &[IrNode],
    props: &serde_json::Map<String, serde_json::Value>,
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    let pad = " ".repeat(indent);
    let child_lines = render_child_lines(children, indent + 4, document, render_context);
    let spacing = first_style_u16_prop(props, &["gap", "spacing"])
        .or_else(|| first_u16_prop(props, &["spacing"]))
        .unwrap_or(12);

    format!(
        r#"{pad}crate::adaptive::layout::column(vec![
{child_lines}
{pad}], {spacing})"#
    )
}

fn render_container(
    children: &[IrNode],
    props: &serde_json::Map<String, serde_json::Value>,
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    let pad = " ".repeat(indent);
    let spacing = first_style_u16_prop(props, &["gap", "spacing"]).unwrap_or(8);
    let child_expr = if has_class_name(props, "grid") {
        render_children_as_grid(children, indent + 4, document, render_context)
    } else if children.len() == 1 {
        render_node(&children[0], indent + 4, document, render_context)
    } else {
        render_children_as_column_with_spacing(children, indent + 4, document, render_context, spacing)
    };
    let style_expr = with_fill_width_if_needed(rust_style_expr(props), props);

    if style_expr != "crate::adaptive::style::AdaptiveStyle::default()" {
        format!(
            r#"{pad}crate::adaptive::components::surface_styled({{
{child_expr}
{pad}}}, {style_expr})"#
        )
    } else {
        format!(
            r#"{pad}crate::adaptive::components::container_box_styled({{
{child_expr}
{pad}}}, {style_expr})"#
        )
    }
}

fn render_button(
    props: &serde_json::Map<String, serde_json::Value>,
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    let pad = " ".repeat(indent);
    let label = first_string_prop(props, &["label", "text", "title"])
        .or_else(|| {
            let text = extract_text_from_children(children);
            if text.is_empty() { None } else { Some(text) }
        })
        .unwrap_or_else(|| "Button".to_string());

    render_context.button_component_index += 1;

    let style_expr = with_fill_width_if_needed(rust_style_expr(props), props);

    if props.contains_key("onPress") {
        if let Some(action) = document
        .component_actions
        .iter()
        .find(|binding| binding.component == "Button" && binding.event_name == "onPress")
        {
            let _ = (&action.state_id, action.index, &action.target);
            let message_variant = message_variant_name(&action.action_id);
            return format!(
                r#"{pad}crate::adaptive::components::button_node_action_styled({}, GeneratedMessage::{message_variant}, {style_expr})"#,
                rust_string_literal(&label)
            );
        }
    }

    format!(
        r#"{pad}crate::adaptive::components::button_node_styled({}, {style_expr})"#,
        rust_string_literal(&label)
    )
}

fn render_text(
    props: &serde_json::Map<String, serde_json::Value>,
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    let pad = " ".repeat(indent);
    render_context.text_component_index += 1;
    let rendered_text = extract_text_from_children(children);
    let style_expr = rust_style_expr(props);

    if let Some(binding) = document
        .component_bindings
        .iter()
        .find(|binding| {
            binding.component == "Text"
                && binding.target == "text.content"
                && rendered_text.starts_with(binding.prefix.as_deref().unwrap_or_default())
        })
    {
        let prefix = binding.prefix.as_deref().unwrap_or_default();
        let suffix = binding.suffix.as_deref().unwrap_or_default();
        let _ = (&binding.target, binding.index);

        return format!(
            r#"{pad}crate::adaptive::components::text_node_styled(format!("{{}}{{}}{{}}", {}, state.{}.get().to_string(), {}), {style_expr})"#,
            rust_string_literal(prefix),
            rust_field_name(&binding.state_id),
            rust_string_literal(suffix)
        );
    }

    format!(
        r#"{pad}crate::adaptive::components::text_node_styled({}, {style_expr})"#,
        rust_string_literal(&rendered_text)
    )
}

fn render_input(props: &serde_json::Map<String, serde_json::Value>, indent: usize) -> String {
    let pad = " ".repeat(indent);
    let value = first_string_prop(props, &["value"]).unwrap_or_default();
    let placeholder = first_string_prop(props, &["placeholder"]).unwrap_or_default();
    let style_expr = rust_style_expr(props);

    format!(
        r#"{pad}crate::adaptive::components::input_node_styled({}, {}, {style_expr})"#,
        rust_string_literal(&placeholder),
        rust_string_literal(&value)
    )
}

fn render_heading(
    props: &serde_json::Map<String, serde_json::Value>,
    value: &str,
    indent: usize,
) -> String {
    let pad = " ".repeat(indent);
    let level = first_u16_prop(props, &["level"]).unwrap_or(1);
    let size = first_style_u16_prop(props, &["fontSize"]).unwrap_or(match level {
        1 => 32,
        2 => 28,
        3 => 24,
        4 => 20,
        _ => 18,
    });
    let style_expr = rust_style_expr(props);

    format!(
        r#"{pad}crate::adaptive::components::heading_styled({}, {size}, {style_expr})"#,
        rust_string_literal(value)
    )
}

fn render_link(
    props: &serde_json::Map<String, serde_json::Value>,
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
) -> String {
    let pad = " ".repeat(indent);
    let label = first_string_prop(props, &["label", "text", "title"])
        .or_else(|| {
            let text = extract_text_from_children(children);
            if text.is_empty() { None } else { Some(text) }
        })
        .unwrap_or_else(|| "Link".to_string());
    let style_expr = rust_style_expr(props);
    let href = first_string_prop(props, &["href"]).unwrap_or_default();

    if effective_pages(document, &document.tree)
        .iter()
        .any(|page| page.route == href)
    {
        return format!(
            r#"{pad}crate::adaptive::components::button_node_action_styled({}, GeneratedMessage::NavigateTo{}, {style_expr})"#,
            rust_string_literal(&label),
            page_variant_name(&href)
        );
    }

    format!(
        r#"{pad}crate::adaptive::components::link_node_styled({}, {style_expr})"#,
        rust_string_literal(&label)
    )
}

fn render_spacer(props: &serde_json::Map<String, serde_json::Value>, indent: usize) -> String {
    let pad = " ".repeat(indent);
    let size = first_u16_prop(props, &["size", "height", "width"]).unwrap_or(16);

    format!(r#"{pad}crate::adaptive::components::spacer({size})"#)
}

fn render_unknown_element(
    tag: &str,
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    let pad = " ".repeat(indent);
    let child_expr = render_children_as_column(children, indent + 4, document, render_context);

    format!(
        r#"{pad}crate::adaptive::components::unknown({}, {{
{child_expr}
{pad}}})"#,
        rust_string_literal(tag)
    )
}

fn render_children_as_column(
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    render_children_as_column_with_spacing(children, indent, document, render_context, 8)
}

fn render_children_as_column_with_spacing(
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
    spacing: u16,
) -> String {
    let pad = " ".repeat(indent);
    let child_lines = render_child_lines(children, indent + 4, document, render_context);

    format!(
        r#"{pad}crate::adaptive::layout::column(vec![
{child_lines}
{pad}], {spacing})"#
    )
}

fn render_children_as_grid(
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    let pad = " ".repeat(indent);
    let rows = children
        .chunks(3)
        .map(|chunk| {
            let child_lines = render_child_lines(chunk, indent + 8, document, render_context);
            format!(
                r#"{pad}    crate::adaptive::layout::row(vec![
{child_lines}
{pad}    ], 20)"#
            )
        })
        .collect::<Vec<_>>()
        .join(",\n");

    format!(
        r#"{pad}crate::adaptive::layout::column(vec![
{rows}
{pad}], 20)"#
    )
}

fn render_child_lines(
    children: &[IrNode],
    indent: usize,
    document: &DesktopIrDocument,
    render_context: &mut RenderContext,
) -> String {
    if children.is_empty() {
        return format!(
            "{}crate::adaptive::components::text_node(\"\"),",
            " ".repeat(indent)
        );
    }

    children
        .iter()
        .map(|child| {
            let rendered = render_node(child, indent, document, render_context);
            format!("{rendered},")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_text_element(value: &str, indent: usize) -> String {
    let pad = " ".repeat(indent);
    format!(
        r#"{pad}crate::adaptive::components::text_node({})"#,
        rust_string_literal(value)
    )
}

fn extract_text_from_children(children: &[IrNode]) -> String {
    let mut parts = Vec::new();
    collect_text(children, &mut parts);
    parts.join(" ").trim().to_string()
}

fn collect_text(children: &[IrNode], parts: &mut Vec<String>) {
    for child in children {
        match child {
            IrNode::Text { value } => {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    parts.push(trimmed.to_string());
                }
            }
            IrNode::Dynamic { hint } => {
                let label = hint
                    .as_deref()
                    .map(|value| format!("[dynamic] {}", value))
                    .unwrap_or_else(|| "[dynamic]".to_string());
                parts.push(label);
            }
            IrNode::Fragment { children } => collect_text(children, parts),
            IrNode::Element { children, .. } => collect_text(children, parts),
        }
    }
}

fn first_string_prop(
    props: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter().find_map(|key| {
        props
            .get(*key)
            .and_then(|value| value.as_str().map(|text| text.to_string()))
    })
}

fn first_u16_prop(
    props: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<u16> {
    keys.iter().find_map(|key| {
        props.get(*key).and_then(|value| {
            value
                .as_u64()
                .and_then(|number| u16::try_from(number).ok())
                .or_else(|| {
                    value.as_str().and_then(|text| {
                        let digits = text
                            .chars()
                            .take_while(|character| character.is_ascii_digit())
                            .collect::<String>();

                        if digits.is_empty() {
                            None
                        } else {
                            digits.parse::<u16>().ok()
                        }
                    })
                })
        })
    })
}

fn first_style_u16_prop(
    props: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<u16> {
    props
        .get("style")
        .and_then(|value| value.as_object())
        .and_then(|style| first_u16_prop(style, keys))
}

fn has_class_name(props: &serde_json::Map<String, serde_json::Value>, class_name: &str) -> bool {
    props
        .get("className")
        .and_then(|value| value.as_str())
        .map(|value| value.split_whitespace().any(|class| class == class_name))
        .unwrap_or(false)
}

fn with_fill_width_if_needed(style_expr: String, props: &serde_json::Map<String, serde_json::Value>) -> String {
    if has_style_fill_width(props) && !style_expr.contains(".with_fill_width(true)") {
        format!("{style_expr}.with_fill_width(true)")
    } else {
        style_expr
    }
}

fn has_style_fill_width(props: &serde_json::Map<String, serde_json::Value>) -> bool {
    props
        .get("style")
        .and_then(|value| value.as_object())
        .and_then(|style| style.get("width"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim() == "100%")
        .unwrap_or(false)
}

fn rust_style_expr(props: &serde_json::Map<String, serde_json::Value>) -> String {
    let Some(style) = props.get("style").and_then(|value| value.as_object()) else {
        return String::from("crate::adaptive::style::AdaptiveStyle::default()");
    };

    let mut chain = String::from("crate::adaptive::style::AdaptiveStyle::default()");

    if let Some(color) = style
        .get("background")
        .or_else(|| style.get("backgroundColor"))
        .and_then(json_as_str)
    {
        chain.push_str(&format!(
            ".with_background(crate::adaptive::style::parse_color({}).unwrap())",
            rust_string_literal(color)
        ));
    }

    if let Some(color) = style.get("color").and_then(json_as_str) {
        chain.push_str(&format!(
            ".with_text_color(crate::adaptive::style::parse_color({}).unwrap())",
            rust_string_literal(color)
        ));
    }

    if let Some(color) = style.get("borderColor").and_then(json_as_str) {
        chain.push_str(&format!(
            ".with_border_color(crate::adaptive::style::parse_color({}).unwrap())",
            rust_string_literal(color)
        ));
    }

    if let Some(border) = style.get("border").and_then(json_as_str) {
        if let Some((width, color)) = parse_border_shorthand(border) {
            chain.push_str(&format!(".with_border_width({width}f32)"));
            chain.push_str(&format!(
                ".with_border_color(crate::adaptive::style::parse_color({}).unwrap())",
                rust_string_literal(&color)
            ));
        }
    }

    if let Some(radius) = style
        .get("borderRadius")
        .and_then(json_as_f32)
    {
        chain.push_str(&format!(".with_border_radius({radius}f32)"));
    }

    if let Some(width) = style.get("borderWidth").and_then(json_as_f32) {
        chain.push_str(&format!(".with_border_width({width}f32)"));
    }

    if let Some(padding) = style
        .get("padding")
        .and_then(json_as_u16)
        .or_else(|| first_u16_prop(props, &["padding"]))
    {
        chain.push_str(&format!(".with_padding({padding})"));
    }

    if let Some(font_size) = style
        .get("fontSize")
        .and_then(json_as_f32)
    {
        chain.push_str(&format!(".with_font_size({font_size}f32)"));
    }

    if style
        .get("width")
        .and_then(json_as_str)
        .map(|value| value.trim() == "100%")
        .unwrap_or(false)
    {
        chain.push_str(".with_fill_width(true)");
    }

    chain
}

fn json_as_str(value: &serde_json::Value) -> Option<&str> {
    value.as_str()
}

fn json_as_f32(value: &serde_json::Value) -> Option<f32> {
    value
        .as_f64()
        .map(|number| number as f32)
        .or_else(|| value.as_str().and_then(parse_length_string))
}

fn json_as_u16(value: &serde_json::Value) -> Option<u16> {
    value
        .as_u64()
        .and_then(|number| u16::try_from(number).ok())
        .or_else(|| {
            value
                .as_str()
                .and_then(parse_length_string)
                .and_then(|number| u16::try_from(number.round() as i64).ok())
        })
}

fn parse_length_string(value: &str) -> Option<f32> {
    let digits = value
        .chars()
        .take_while(|character| character.is_ascii_digit() || *character == '.')
        .collect::<String>();

    if digits.is_empty() {
        None
    } else {
        digits.parse::<f32>().ok()
    }
}

fn parse_border_shorthand(value: &str) -> Option<(f32, String)> {
    let trimmed = value.trim();
    let mut parts = trimmed.splitn(3, char::is_whitespace);
    let width_part = parts.next()?;
    let style_part = parts.next()?;
    let color_part = parts.next()?.trim();

    if style_part.is_empty() || color_part.is_empty() {
        return None;
    }

    let width = parse_length_string(width_part)?;
    let color = color_part.to_string();
    Some((width, color))
}

fn generate_state_struct(document: &DesktopIrDocument) -> String {
    let _ = summarize_bindings(&document.bindings);
    let fields = if document.state.is_empty() {
        String::from("    _unit: (),")
    } else {
        document
            .state
            .iter()
            .map(|state| {
                let _ = (&state.kind, &state.source, &state.setter);
                format!(
                    "    pub {}: crate::adaptive::runtime::Reactive<{}>,",
                    rust_field_name(&state.id),
                    rust_type_for_json(&state.initial)
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let initializers = if document.state.is_empty() {
        String::from("            _unit: (),")
    } else {
        document
            .state
            .iter()
            .map(|state| {
                format!(
                    "            {}: crate::adaptive::runtime::use_reactive({}),",
                    rust_field_name(&state.id),
                    rust_expr_for_json(&state.initial)
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        r#"#[derive(Debug, Clone)]
pub struct GeneratedState {{
{fields}
}}

impl GeneratedState {{
    pub fn new() -> Self {{
        Self {{
{initializers}
        }}
    }}
}}"#
    )
}

fn generate_message_enum(document: &DesktopIrDocument) -> String {
    let mut variants = effective_pages(document, &document.tree)
        .iter()
        .map(|page| format!("    NavigateTo{},", page_variant_name(&page.route)))
        .collect::<Vec<_>>();

    variants.extend(
        document
            .actions
            .iter()
            .map(|action| format!("    {},", message_variant_name(&action.id)))
    );

    if variants.is_empty() {
        variants.push(String::from("    Noop,"));
    }

    format!(
        r#"#[derive(Debug, Clone)]
pub enum GeneratedMessage {{
{}
}}"#,
        variants.join("\n")
    )
}

fn generate_update_impl(document: &DesktopIrDocument) -> String {
    let mut match_arms = effective_pages(document, &document.tree)
        .iter()
        .map(|page| format!("        GeneratedMessage::NavigateTo{} => {{}}", page_variant_name(&page.route)))
        .collect::<Vec<_>>();

    match_arms.extend(document.actions.iter().map(generate_action_match_arm));

    if match_arms.is_empty() {
        match_arms.push(String::from("        GeneratedMessage::Noop => {}"));
    }

    let state_param = if document.actions.is_empty() {
        "_state"
    } else {
        "state"
    };

    format!(
        r#"pub fn update_generated({state_param}: &GeneratedState, message: &GeneratedMessage) {{
    match message {{
{}
    }}
}}"#,
        match_arms.join("\n")
    )
}

fn generate_action_match_arm(action: &IrStateAction) -> String {
    let _ = (&action.setter, &action.scope);
    let variant = message_variant_name(&action.id);
    let field = rust_field_name(&action.state_id);
    let body = match action.operation.as_str() {
        "add" => format!(
            "state.{field}.update(|value| *value += {});",
            rust_expr_for_optional_json(action.argument.as_ref())
        ),
        "set" => format!(
            "state.{field}.set({});",
            rust_expr_for_optional_json(action.argument.as_ref())
        ),
        _ => String::from("{}"),
    };

    format!("        GeneratedMessage::{variant} => {{ {body} }}")
}

fn generate_page_enum(document: &DesktopIrDocument) -> String {
    let variants = effective_pages(document, &document.tree)
        .iter()
        .map(|page| format!("    {},", page_variant_name(&page.route)))
        .collect::<Vec<_>>();

    format!(
        r#"#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GeneratedPage {{
{}
}}"#,
        variants.join("\n")
    )
}

fn generate_navigation_helpers(document: &DesktopIrDocument) -> String {
    let initial_route = document
        .initial_route
        .as_deref()
        .unwrap_or("/");
    let initial_variant = page_variant_name(initial_route);
    let pages = effective_pages(document, &document.tree);
    let match_arms = pages
        .iter()
        .map(|page| {
            format!(
                "        GeneratedMessage::NavigateTo{} => Some(GeneratedPage::{}),",
                page_variant_name(&page.route),
                page_variant_name(&page.route)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let fallback_arm = if pages.is_empty() || !document.actions.is_empty() {
        "        _ => None,"
    } else {
        ""
    };

    format!(
        r#"pub fn initial_page() -> GeneratedPage {{
    GeneratedPage::{initial_variant}
}}

pub fn navigate_page(message: &GeneratedMessage) -> Option<GeneratedPage> {{
    match message {{
{match_arms}
{fallback_arm}
    }}
}}"#
    )
}

fn effective_pages(document: &DesktopIrDocument, tree: &IrNode) -> Vec<DesktopIrPage> {
    if !document.pages.is_empty() {
        return document.pages.clone();
    }

    vec![DesktopIrPage {
        route: document
            .initial_route
            .clone()
            .unwrap_or_else(|| String::from("/")),
        source: document.entry.clone(),
        state: document.state.clone(),
        bindings: document.bindings.clone(),
        actions: document.actions.clone(),
        component_bindings: document.component_bindings.clone(),
        component_actions: document.component_actions.clone(),
        tree: tree.clone(),
    }]
}

fn page_variant_name(route: &str) -> String {
    if route == "/" {
        return String::from("Home");
    }

    let mut output = String::new();
    for part in route.split(|character: char| !character.is_ascii_alphanumeric()) {
        if part.is_empty() {
            continue;
        }
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            output.push(first.to_ascii_uppercase());
            output.extend(chars);
        }
    }
    if output.is_empty() {
        String::from("Page")
    } else {
        output
    }
}

fn message_variant_name(action_id: &str) -> String {
    let mut output = String::from("Action");
    for part in action_id.split(|character: char| !character.is_ascii_alphanumeric()) {
        if part.is_empty() {
            continue;
        }
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            output.push(first.to_ascii_uppercase());
            output.extend(chars);
        }
    }
    output
}

fn rust_field_name(state_id: &str) -> String {
    state_id.replace('-', "_")
}

fn rust_type_for_json(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::Number(_) => "i32",
        serde_json::Value::Bool(_) => "bool",
        serde_json::Value::String(_) => "String",
        _ => "String",
    }
}

fn rust_expr_for_optional_json(value: Option<&serde_json::Value>) -> String {
    value
        .map(rust_expr_for_json)
        .unwrap_or_else(|| "String::new()".to_string())
}

fn rust_expr_for_json(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => format!("String::from({})", rust_string_literal(text)),
        serde_json::Value::Number(number) => format!("{}i32", number),
        serde_json::Value::Bool(flag) => flag.to_string(),
        serde_json::Value::Null => "String::new()".to_string(),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => "String::new()".to_string(),
    }
}

fn rust_string_literal(value: &str) -> String {
    format!("{:?}", value)
}

fn fallback_document() -> DesktopIrDocument {
    DesktopIrDocument {
        kind: String::from("desktop-entry"),
        entry: String::from("unknown"),
        initial_route: Some(String::from("/")),
        state: Vec::new(),
        bindings: Vec::new(),
        actions: Vec::new(),
        component_bindings: Vec::new(),
        component_actions: Vec::new(),
        pages: Vec::new(),
        tree: IrNode::Fragment { children: Vec::new() },
    }
}

fn summarize_bindings(bindings: &[IrStateBinding]) -> String {
    if bindings.is_empty() {
        return String::from("none");
    }

    bindings
        .iter()
        .map(|binding| format!("{} via {} ({})", binding.state_id, binding.access, binding.scope))
        .collect::<Vec<_>>()
        .join(", ")
}
