use std::fmt;
use std::ops::{Deref, DerefMut};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageLifecycleEvent {
    Create,
    Start,
    Resume,
    Pause,
    Stop,
    Destroy,
}

pub trait AdaptivePageLifecycle {
    fn on_create(&mut self) {}
    fn on_start(&mut self) {}
    fn on_resume(&mut self) {}
    fn on_pause(&mut self) {}
    fn on_stop(&mut self) {}
    fn on_destroy(&mut self) {}
}

pub struct PageHandle<P> {
    page: P,
    created: bool,
    started: bool,
    resumed: bool,
    lifecycle: Vec<PageLifecycleEvent>,
}

impl<P> PageHandle<P>
where
    P: AdaptivePageLifecycle,
{
    pub fn new(page: P) -> Self {
        Self {
            page,
            created: false,
            started: false,
            resumed: false,
            lifecycle: Vec::new(),
        }
    }

    pub fn boot(&mut self) {
        if !self.created {
            self.page.on_create();
            self.lifecycle.push(PageLifecycleEvent::Create);
            self.created = true;
        }

        if !self.started {
            self.page.on_start();
            self.lifecycle.push(PageLifecycleEvent::Start);
            self.started = true;
        }

        if !self.resumed {
            self.page.on_resume();
            self.lifecycle.push(PageLifecycleEvent::Resume);
            self.resumed = true;
        }
    }

    pub fn pause(&mut self) {
        if self.resumed {
            self.page.on_pause();
            self.lifecycle.push(PageLifecycleEvent::Pause);
            self.resumed = false;
        }
    }

    pub fn resume(&mut self) {
        if self.created && self.started && !self.resumed {
            self.page.on_resume();
            self.lifecycle.push(PageLifecycleEvent::Resume);
            self.resumed = true;
        }
    }

    pub fn stop(&mut self) {
        self.pause();
        if self.started {
            self.page.on_stop();
            self.lifecycle.push(PageLifecycleEvent::Stop);
            self.started = false;
        }
    }

    pub fn destroy(&mut self) {
        self.stop();
        if self.created {
            self.page.on_destroy();
            self.lifecycle.push(PageLifecycleEvent::Destroy);
            self.created = false;
        }
    }

    pub fn lifecycle(&self) -> &[PageLifecycleEvent] {
        &self.lifecycle
    }

    pub fn into_inner(self) -> P {
        self.page
    }
}

impl<P> Deref for PageHandle<P> {
    type Target = P;

    fn deref(&self) -> &Self::Target {
        &self.page
    }
}

impl<P> DerefMut for PageHandle<P> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.page
    }
}

impl<P> fmt::Debug for PageHandle<P>
where
    P: fmt::Debug,
{
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PageHandle")
            .field("page", &self.page)
            .field("created", &self.created)
            .field("started", &self.started)
            .field("resumed", &self.resumed)
            .field("lifecycle", &self.lifecycle)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::{AdaptivePageLifecycle, PageHandle, PageLifecycleEvent};

    #[derive(Debug, Default)]
    struct FakePage {
        calls: Vec<&'static str>,
    }

    impl AdaptivePageLifecycle for FakePage {
        fn on_create(&mut self) {
            self.calls.push("create");
        }

        fn on_start(&mut self) {
            self.calls.push("start");
        }

        fn on_resume(&mut self) {
            self.calls.push("resume");
        }

        fn on_pause(&mut self) {
            self.calls.push("pause");
        }

        fn on_stop(&mut self) {
            self.calls.push("stop");
        }

        fn on_destroy(&mut self) {
            self.calls.push("destroy");
        }
    }

    #[test]
    fn page_handle_runs_lifecycle_in_order() {
        let mut page = PageHandle::new(FakePage::default());
        page.boot();
        page.pause();
        page.resume();
        page.destroy();

        assert_eq!(
            page.calls,
            vec!["create", "start", "resume", "pause", "resume", "pause", "stop", "destroy"]
        );
        assert_eq!(
            page.lifecycle(),
            &[
                PageLifecycleEvent::Create,
                PageLifecycleEvent::Start,
                PageLifecycleEvent::Resume,
                PageLifecycleEvent::Pause,
                PageLifecycleEvent::Resume,
                PageLifecycleEvent::Pause,
                PageLifecycleEvent::Stop,
                PageLifecycleEvent::Destroy,
            ]
        );
    }
}
