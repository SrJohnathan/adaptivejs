use std::collections::BTreeMap;
use std::fmt;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

type Subscriber = Arc<dyn Fn() + Send + Sync + 'static>;

struct ReactiveInner<T> {
    value: RwLock<T>,
    version: AtomicU64,
    next_subscriber_id: AtomicUsize,
    subscribers: Mutex<BTreeMap<usize, Subscriber>>,
}

pub struct Reactive<T> {
    inner: Arc<ReactiveInner<T>>,
}

impl<T> Clone for Reactive<T> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

impl<T> fmt::Debug for Reactive<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Reactive")
            .field("version", &self.version())
            .finish_non_exhaustive()
    }
}

pub struct ReactiveSubscription<T> {
    reactive: Reactive<T>,
    id: usize,
}

impl<T> Drop for ReactiveSubscription<T> {
    fn drop(&mut self) {
        self.reactive.unsubscribe(self.id);
    }
}

impl<T> Reactive<T> {
    pub fn new(initial_value: T) -> Self {
        Self {
            inner: Arc::new(ReactiveInner {
                value: RwLock::new(initial_value),
                version: AtomicU64::new(0),
                next_subscriber_id: AtomicUsize::new(1),
                subscribers: Mutex::new(BTreeMap::new()),
            }),
        }
    }

    pub fn set(&self, next_value: T) {
        {
            let mut value = self.inner.value.write().expect("reactive write lock poisoned");
            *value = next_value;
        }
        self.bump_and_notify();
    }

    pub fn update<F>(&self, updater: F)
    where
        F: FnOnce(&mut T),
    {
        {
            let mut value = self.inner.value.write().expect("reactive write lock poisoned");
            updater(&mut value);
        }
        self.bump_and_notify();
    }

    pub fn with<R, F>(&self, reader: F) -> R
    where
        F: FnOnce(&T) -> R,
    {
        let value = self.inner.value.read().expect("reactive read lock poisoned");
        reader(&value)
    }

    pub fn version(&self) -> u64 {
        self.inner.version.load(Ordering::SeqCst)
    }

    pub fn subscribe<F>(&self, callback: F) -> ReactiveSubscription<T>
    where
        F: Fn() + Send + Sync + 'static,
    {
        let id = self
            .inner
            .next_subscriber_id
            .fetch_add(1, Ordering::SeqCst);
        let subscriber: Subscriber = Arc::new(callback);
        let mut subscribers = self
            .inner
            .subscribers
            .lock()
            .expect("reactive subscribers lock poisoned");
        subscribers.insert(id, subscriber);
        drop(subscribers);

        ReactiveSubscription {
            reactive: self.clone(),
            id,
        }
    }

    fn unsubscribe(&self, id: usize) {
        let mut subscribers = self
            .inner
            .subscribers
            .lock()
            .expect("reactive subscribers lock poisoned");
        subscribers.remove(&id);
    }

    fn bump_and_notify(&self) {
        self.inner.version.fetch_add(1, Ordering::SeqCst);
        let subscribers = {
            let subscribers = self
                .inner
                .subscribers
                .lock()
                .expect("reactive subscribers lock poisoned");
            subscribers.values().cloned().collect::<Vec<_>>()
        };

        for subscriber in subscribers {
            subscriber();
        }
    }
}

impl<T: Clone> Reactive<T> {
    pub fn get(&self) -> T {
        self.with(|value| value.clone())
    }
}

pub fn use_reactive<T>(initial_value: T) -> Reactive<T> {
    Reactive::new(initial_value)
}

#[cfg(test)]
mod tests {
    use super::use_reactive;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn reactive_get_set_and_update_work() {
        let count = use_reactive(1_u32);

        assert_eq!(count.get(), 1);
        assert_eq!(count.version(), 0);

        count.set(2);
        assert_eq!(count.get(), 2);
        assert_eq!(count.version(), 1);

        count.update(|value| *value += 3);
        assert_eq!(count.get(), 5);
        assert_eq!(count.version(), 2);
    }

    #[test]
    fn reactive_subscription_is_notified_and_can_drop() {
        let text = use_reactive(String::from("hello"));
        let hits = Arc::new(AtomicUsize::new(0));
        let hits_ref = hits.clone();

        let subscription = text.subscribe(move || {
            hits_ref.fetch_add(1, Ordering::SeqCst);
        });

        text.set(String::from("world"));
        text.update(|value| value.push('!'));
        assert_eq!(hits.load(Ordering::SeqCst), 2);

        drop(subscription);
        text.set(String::from("ignored"));
        assert_eq!(hits.load(Ordering::SeqCst), 2);
    }
}
