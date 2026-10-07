// Package hub provides real-time board sync via Server-Sent Events.
//
// The Notifier interface is the single integration point — InMemoryHub is the
// default implementation for single-instance deployments. Future implementations
// (Redis pub/sub, CDC-backed) satisfy the same interface; swap in main.go only.
package hub

import (
	"sync"
	"time"
)

// Notifier is the contract between the SSE handler, the notify middleware,
// and any concrete fan-out implementation.
type Notifier interface {
	// Notify schedules a ping to all clients subscribed to boardID.
	// Implementations must be safe for concurrent use.
	Notify(boardID string)
	// Subscribe registers a listener for boardID. The caller must call unsub
	// when done to avoid a goroutine/memory leak.
	Subscribe(boardID string) (ch <-chan struct{}, unsub func())
}

// InMemoryHub fans out board-change notifications to subscribed SSE clients.
// Safe for concurrent use. Notifications are debounced per boardID to coalesce
// bursts (e.g. drag-reorder firing 10 mutations).
type InMemoryHub struct {
	mu      sync.RWMutex
	clients map[string][]chan struct{}

	dmu        sync.Mutex
	pending    map[string]*time.Timer
	debounceMs time.Duration
}

func New() *InMemoryHub {
	return &InMemoryHub{
		clients:    make(map[string][]chan struct{}),
		pending:    make(map[string]*time.Timer),
		debounceMs: 100 * time.Millisecond,
	}
}

func (h *InMemoryHub) Subscribe(boardID string) (ch <-chan struct{}, unsub func()) {
	c := make(chan struct{}, 1)
	h.mu.Lock()
	h.clients[boardID] = append(h.clients[boardID], c)
	h.mu.Unlock()
	return c, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		cs := h.clients[boardID]
		for i, x := range cs {
			if x == c {
				h.clients[boardID] = append(cs[:i], cs[i+1:]...)
				return
			}
		}
	}
}

// Notify debounces rapid calls per boardID and fans out a single ping.
func (h *InMemoryHub) Notify(boardID string) {
	h.dmu.Lock()
	if t, ok := h.pending[boardID]; ok {
		t.Reset(h.debounceMs)
		h.dmu.Unlock()
		return
	}
	h.pending[boardID] = time.AfterFunc(h.debounceMs, func() {
		h.dmu.Lock()
		delete(h.pending, boardID)
		h.dmu.Unlock()
		h.fan(boardID)
	})
	h.dmu.Unlock()
}

func (h *InMemoryHub) fan(boardID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients[boardID] {
		select {
		case c <- struct{}{}:
		default: // slow client, drop — they catch up on next ping
		}
	}
}

// FakeNotifier records Notify calls synchronously. Use in tests to assert
// middleware wiring without debounce delay.
type FakeNotifier struct {
	mu       sync.Mutex
	notified []string
}

func (f *FakeNotifier) Notify(boardID string) {
	f.mu.Lock()
	f.notified = append(f.notified, boardID)
	f.mu.Unlock()
}

func (f *FakeNotifier) Subscribe(boardID string) (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	return ch, func() {}
}

func (f *FakeNotifier) WasNotified(boardID string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, id := range f.notified {
		if id == boardID {
			return true
		}
	}
	return false
}

func (f *FakeNotifier) NotifyCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.notified)
}

func (f *FakeNotifier) Reset() {
	f.mu.Lock()
	f.notified = nil
	f.mu.Unlock()
}
