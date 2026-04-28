use iced::widget::{Column, Row};
use iced::{Alignment, Element};

pub fn column<'a, Message: Clone + 'a>(
    children: Vec<Element<'a, Message>>,
    spacing: u16,
) -> Element<'a, Message> {
    Column::with_children(children)
        .spacing(spacing as f32)
        .align_x(Alignment::Start)
        .into()
}

pub fn row<'a, Message: Clone + 'a>(
    children: Vec<Element<'a, Message>>,
    spacing: u16,
) -> Element<'a, Message> {
    Row::with_children(children)
        .spacing(spacing as f32)
        .align_y(Alignment::Center)
        .into()
}
