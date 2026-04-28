use iced::border::{self, Border};
use iced::{Background, Color};

#[derive(Debug, Clone, Default)]
pub struct AdaptiveStyle {
    pub background: Option<Color>,
    pub text_color: Option<Color>,
    pub border_color: Option<Color>,
    pub border_radius: Option<f32>,
    pub border_width: Option<f32>,
    pub padding: Option<u16>,
    pub font_size: Option<f32>,
    pub fill_width: bool,
}

impl AdaptiveStyle {
    pub fn with_background(mut self, value: Color) -> Self {
        self.background = Some(value);
        self
    }

    pub fn with_text_color(mut self, value: Color) -> Self {
        self.text_color = Some(value);
        self
    }

    pub fn with_border_color(mut self, value: Color) -> Self {
        self.border_color = Some(value);
        self
    }

    pub fn with_border_radius(mut self, value: f32) -> Self {
        self.border_radius = Some(value);
        self
    }

    pub fn with_border_width(mut self, value: f32) -> Self {
        self.border_width = Some(value);
        self
    }

    pub fn with_padding(mut self, value: u16) -> Self {
        self.padding = Some(value);
        self
    }

    pub fn with_font_size(mut self, value: f32) -> Self {
        self.font_size = Some(value);
        self
    }

    pub fn with_fill_width(mut self, value: bool) -> Self {
        self.fill_width = value;
        self
    }
}

pub fn parse_color(input: &str) -> Option<Color> {
    let value = input.trim();

    if let Some(hex) = value.strip_prefix('#') {
        return parse_hex_color(hex);
    }

    if let Some(color) = parse_rgb_function(value) {
        return Some(color);
    }

    match value.to_ascii_lowercase().as_str() {
        "black" => Some(Color::BLACK),
        "white" => Some(Color::WHITE),
        "transparent" => Some(Color::TRANSPARENT),
        _ => None,
    }
}

pub fn parse_length(input: &str) -> Option<f32> {
    let digits = input
        .chars()
        .take_while(|character| character.is_ascii_digit() || *character == '.')
        .collect::<String>();

    if digits.is_empty() {
        None
    } else {
        digits.parse::<f32>().ok()
    }
}

pub fn border_from_style(style: &AdaptiveStyle) -> Border {
    let mut border = Border::default();

    if let Some(color) = style.border_color {
        border.color = color;
    }

    if let Some(width) = style.border_width {
        border.width = width;
    }

    if let Some(radius) = style.border_radius {
        border.radius = border::Radius::from(radius);
    }

    border
}

pub fn background_from_style(style: &AdaptiveStyle) -> Option<Background> {
    style.background.map(Background::Color)
}

fn parse_hex_color(hex: &str) -> Option<Color> {
    match hex.len() {
        3 => {
            let [r, g, b] = hex.as_bytes() else {
                return None;
            };
            Some(Color::from_rgb8(
                expand_hex(*r)?,
                expand_hex(*g)?,
                expand_hex(*b)?,
            ))
        }
        4 => {
            let [r, g, b, a] = hex.as_bytes() else {
                return None;
            };
            Some(Color::from_rgba8(
                expand_hex(*r)?,
                expand_hex(*g)?,
                expand_hex(*b)?,
                expand_hex(*a)? as f32 / 255.0,
            ))
        }
        6 => Some(Color::from_rgb8(
            u8::from_str_radix(&hex[0..2], 16).ok()?,
            u8::from_str_radix(&hex[2..4], 16).ok()?,
            u8::from_str_radix(&hex[4..6], 16).ok()?,
        )),
        8 => Some(Color::from_rgba8(
            u8::from_str_radix(&hex[0..2], 16).ok()?,
            u8::from_str_radix(&hex[2..4], 16).ok()?,
            u8::from_str_radix(&hex[4..6], 16).ok()?,
            u8::from_str_radix(&hex[6..8], 16).ok()? as f32 / 255.0,
        )),
        _ => None,
    }
}

fn expand_hex(value: u8) -> Option<u8> {
    let digit = (value as char).to_digit(16)? as u8;
    Some((digit << 4) | digit)
}

fn parse_rgb_function(input: &str) -> Option<Color> {
    let lower = input.trim().to_ascii_lowercase();
    if let Some(arguments) = lower
        .strip_prefix("rgba(")
        .and_then(|value| value.strip_suffix(')'))
    {
        let parts = arguments
            .split(',')
            .map(|value| value.trim())
            .collect::<Vec<_>>();
        if parts.len() != 4 {
            return None;
        }

        return Some(Color::from_rgba8(
            parts[0].parse::<u8>().ok()?,
            parts[1].parse::<u8>().ok()?,
            parts[2].parse::<u8>().ok()?,
            parts[3].parse::<f32>().ok()?,
        ));
    }

    if let Some(arguments) = lower
        .strip_prefix("rgb(")
        .and_then(|value| value.strip_suffix(')'))
    {
        let parts = arguments
            .split(',')
            .map(|value| value.trim())
            .collect::<Vec<_>>();
        if parts.len() != 3 {
            return None;
        }

        return Some(Color::from_rgb8(
            parts[0].parse::<u8>().ok()?,
            parts[1].parse::<u8>().ok()?,
            parts[2].parse::<u8>().ok()?,
        ));
    }

    None
}
