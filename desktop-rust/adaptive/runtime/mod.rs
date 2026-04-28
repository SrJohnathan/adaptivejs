use iced::widget::container;
use iced::{Element, Fill};

mod page;
mod reactive;

#[allow(unused_imports)]
pub use page::{AdaptivePageLifecycle, PageHandle, PageLifecycleEvent};
#[allow(unused_imports)]
pub use reactive::{Reactive, ReactiveSubscription, use_reactive};

pub fn root<'a, Message: Clone + 'a>(child: Element<'a, Message>) -> Element<'a, Message> {
    container(child).width(Fill).height(Fill).into()
}
