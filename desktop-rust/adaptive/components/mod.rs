use iced::widget::{button, container, text, text_input, Space};
use iced::{Element, Length};
use crate::adaptive::style::{background_from_style, border_from_style, AdaptiveStyle};

pub fn text_node<'a, Message: Clone + 'a>(value: impl Into<String>) -> Element<'a, Message> {
    text(value.into()).into()
}

pub fn text_node_styled<'a, Message: Clone + 'a>(
    value: impl Into<String>,
    style: AdaptiveStyle,
) -> Element<'a, Message> {
    let mut node = text(value.into());

    if let Some(size) = style.font_size {
        node = node.size(size);
    }

    if let Some(color) = style.text_color {
        node = node.color(color);
    }

    node.into()
}

pub fn heading<'a, Message: Clone + 'a>(
    value: impl Into<String>,
    size: u16,
) -> Element<'a, Message> {
    text(value.into()).size(size as f32).into()
}

pub fn heading_styled<'a, Message: Clone + 'a>(
    value: impl Into<String>,
    size: u16,
    style: AdaptiveStyle,
) -> Element<'a, Message> {
    let mut node = text(value.into()).size(size as f32);

    if let Some(color) = style.text_color {
        node = node.color(color);
    }

    node.into()
}

pub fn button_node<'a, Message: Clone + 'a>(label: impl Into<String>) -> Element<'a, Message> {
    button(text(label.into())).into()
}

pub fn button_node_styled<'a, Message: Clone + 'a>(
    label: impl Into<String>,
    style: AdaptiveStyle,
) -> Element<'a, Message> {
    let mut content = text(label.into());
    if let Some(color) = style.text_color {
        content = content.color(color);
    }
    if let Some(size) = style.font_size {
        content = content.size(size);
    }

    let padding = style.padding.unwrap_or(12);
    let border = border_from_style(&style);
    let background = background_from_style(&style);
    let text_color = style.text_color.or_else(|| crate::adaptive::style::parse_color("#0b6b65"));

    let mut node = button(content).padding(padding);
    if style.fill_width {
        node = node.width(Length::Fill);
    }

    node.style(move |_, status| {
            let mut button_style = button::Style::default();
            let _ = status;
            if let Some(background) = background {
                button_style.background = Some(background);
            }
            if let Some(color) = text_color {
                button_style.text_color = color;
            }
            button_style.border = border;
            button_style
        })
        .into()
}

pub fn button_node_action<'a, Message: Clone + 'a>(
    label: impl Into<String>,
    message: Message,
) -> Element<'a, Message> {
    button(text(label.into())).on_press(message).into()
}

pub fn button_node_action_styled<'a, Message: Clone + 'a>(
    label: impl Into<String>,
    message: Message,
    style: AdaptiveStyle,
) -> Element<'a, Message> {
    let mut content = text(label.into());
    if let Some(color) = style.text_color {
        content = content.color(color);
    }
    if let Some(size) = style.font_size {
        content = content.size(size);
    }

    let padding = style.padding.unwrap_or(12);
    let border = border_from_style(&style);
    let background = background_from_style(&style);
    let text_color = style.text_color;

    let mut node = button(content).padding(padding).on_press(message);
    if style.fill_width {
        node = node.width(Length::Fill);
    }

    node.style(move |_, status| {
            let mut button_style = button::Style::default();
            let _ = status;
            if let Some(background) = background {
                button_style.background = Some(background);
            }
            if let Some(color) = text_color {
                button_style.text_color = color;
            }
            button_style.border = border;
            button_style
        })
        .into()
}

pub fn link_node<'a, Message: Clone + 'a>(label: impl Into<String>) -> Element<'a, Message> {
    button(text(label.into())).into()
}

pub fn link_node_styled<'a, Message: Clone + 'a>(
    label: impl Into<String>,
    style: AdaptiveStyle,
) -> Element<'a, Message> {
    let mut content = text(label.into());
    if let Some(color) = style.text_color {
        content = content.color(color);
    }
    if let Some(size) = style.font_size {
        content = content.size(size);
    }

    let padding = style.padding.unwrap_or(6);
    let text_color = style.text_color;

    button(content)
        .padding(padding)
        .style(move |_, _| {
            let mut button_style = button::Style::default();
            button_style.background = None;
            button_style.border.width = 0.0;
            if let Some(color) = text_color {
                button_style.text_color = color;
            }
            button_style
        })
        .into()
}

pub fn bound_text_node<'a, Message: Clone + 'a>(
    prefix: impl Into<String>,
    value: impl Into<String>,
    suffix: impl Into<String>,
) -> Element<'a, Message> {
    text(format!("{}{}{}", prefix.into(), value.into(), suffix.into())).into()
}

pub fn input_node<'a, Message: Clone + 'a>(
    placeholder: impl Into<String>,
    value: impl Into<String>,
) -> Element<'a, Message> {
    text_input(&placeholder.into(), &value.into()).padding(10).into()
}

pub fn input_node_styled<'a, Message: Clone + 'a>(
    placeholder: impl Into<String>,
    value: impl Into<String>,
    style: AdaptiveStyle,
) -> Element<'a, Message> {
    let padding = style.padding.unwrap_or(10);
    let mut node = text_input(&placeholder.into(), &value.into()).padding(padding);
    if style.fill_width {
        node = node.width(Length::Fill);
    }
    node.into()
}

pub fn spacer<'a, Message: Clone + 'a>(size: u16) -> Element<'a, Message> {
    Space::new()
        .width(Length::Fixed(size as f32))
        .height(Length::Fixed(size as f32))
        .into()
}

pub fn container_box<'a, Message: Clone + 'a>(
    child: Element<'a, Message>,
) -> Element<'a, Message> {
    container(child).into()
}

pub fn container_box_styled<'a, Message: Clone + 'a>(
    child: Element<'a, Message>,
    style: AdaptiveStyle,
) -> Element<'a, Message> {
    let padding = style.padding.unwrap_or(0);
    let border = border_from_style(&style);
    let background = background_from_style(&style);
    let text_color = style.text_color;

    container(child)
        .padding(padding)
        .style(move |_| {
            let mut container_style = container::Style::default();
            container_style.border = border;
            container_style.background = background;
            container_style.text_color = text_color;
            container_style
        })
        .into()
}

pub fn surface<'a, Message: Clone + 'a>(
    child: Element<'a, Message>,
    padding: u16,
) -> Element<'a, Message> {
    container(child).padding(padding).into()
}

pub fn surface_styled<'a, Message: Clone + 'a>(
    child: Element<'a, Message>,
    style: AdaptiveStyle,
) -> Element<'a, Message> {
    container_box_styled(child, style)
}

pub fn unknown<'a, Message: Clone + 'a>(
    tag: impl Into<String>,
    child: Element<'a, Message>,
) -> Element<'a, Message> {
    let content = crate::adaptive::layout::column(
        vec![text_node(format!("[{}]", tag.into())), child],
        8,
    );

    container(content).into()
}
