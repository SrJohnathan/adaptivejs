use iced::{Element, Task, Theme};

#[path = "../adaptive/mod.rs"]
mod adaptive;

include!(concat!(env!("OUT_DIR"), "/generated_ui.rs"));

fn main() -> iced::Result {
    iced::application(DesktopApp::new, update, view)
        .title(title)
        .theme(theme)
        .run()
}

#[derive(Debug)]
struct DesktopApp {
    _page: adaptive::runtime::PageHandle<GeneratedRootPage>,
    current_page: GeneratedPage,
    state: GeneratedState,
}

impl DesktopApp {
    fn new() -> Self {
        let mut page = adaptive::runtime::PageHandle::new(GeneratedRootPage);
        page.boot();
        Self {
            _page: page,
            current_page: initial_page(),
            state: GeneratedState::new(),
        }
    }
}

#[derive(Debug, Default)]
struct GeneratedRootPage;

impl adaptive::runtime::AdaptivePageLifecycle for GeneratedRootPage {}

fn update(app: &mut DesktopApp, message: GeneratedMessage) -> Task<GeneratedMessage> {
    if let Some(next_page) = navigate_page(&message) {
        app.current_page = next_page;
        return Task::none();
    }
    update_generated(&app.state, &message);
    Task::none()
}

fn view(app: &DesktopApp) -> Element<'_, GeneratedMessage> {
    render_ui(&app.current_page, &app.state)
}

fn title(_: &DesktopApp) -> String {
    let platform = adaptive::apis::app::App::get_platform();
    format!("Adaptive {}", capitalize_platform(&platform))
}

fn theme(_: &DesktopApp) -> Theme {
    Theme::Light
}

fn capitalize_platform(platform: &str) -> String {
    let mut chars = platform.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::from("Desktop"),
    }
}
