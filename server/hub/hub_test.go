package hub_test

import (
	"testing"
	"time"

	"github.com/ashinsabu/cumin/server/hub"
)

func TestInMemoryHub_SubscribeReceivesNotify(t *testing.T) {
	h := hub.New()
	ch, unsub := h.Subscribe("board-1")
	defer unsub()

	h.Notify("board-1")

	select {
	case <-ch:
	case <-time.After(300 * time.Millisecond):
		t.Fatal("expected notification within debounce window, got none")
	}
}

func TestInMemoryHub_NoNotifyForOtherBoard(t *testing.T) {
	h := hub.New()
	ch, unsub := h.Subscribe("board-1")
	defer unsub()

	h.Notify("board-2")

	select {
	case <-ch:
		t.Fatal("received notification intended for a different board")
	case <-time.After(200 * time.Millisecond):
	}
}

func TestInMemoryHub_MultipleSubscribersAllReceive(t *testing.T) {
	h := hub.New()
	ch1, unsub1 := h.Subscribe("board-1")
	ch2, unsub2 := h.Subscribe("board-1")
	defer unsub1()
	defer unsub2()

	h.Notify("board-1")

	for i, ch := range []<-chan struct{}{ch1, ch2} {
		select {
		case <-ch:
		case <-time.After(300 * time.Millisecond):
			t.Fatalf("subscriber %d did not receive notification", i+1)
		}
	}
}

func TestInMemoryHub_DebounceCoalescesRapidNotifications(t *testing.T) {
	h := hub.New()
	ch, unsub := h.Subscribe("board-1")
	defer unsub()

	// Fire 10 rapid notifications — should coalesce into exactly 1 delivery.
	for i := 0; i < 10; i++ {
		h.Notify("board-1")
	}

	select {
	case <-ch:
	case <-time.After(300 * time.Millisecond):
		t.Fatal("expected coalesced notification, got none")
	}

	// Drain; verify no second delivery arrives.
	time.Sleep(50 * time.Millisecond)
	select {
	case <-ch:
		t.Fatal("debounce should have suppressed extra notifications")
	default:
	}
}

func TestInMemoryHub_UnsubStopsDelivery(t *testing.T) {
	h := hub.New()
	ch, unsub := h.Subscribe("board-1")
	unsub() // unsubscribe before any notify

	h.Notify("board-1")

	time.Sleep(200 * time.Millisecond)
	select {
	case <-ch:
		t.Fatal("unsubscribed client should not receive notifications")
	default:
	}
}

func TestInMemoryHub_IndependentBoards(t *testing.T) {
	h := hub.New()
	ch1, unsub1 := h.Subscribe("board-1")
	ch2, unsub2 := h.Subscribe("board-2")
	defer unsub1()
	defer unsub2()

	h.Notify("board-1")

	select {
	case <-ch1:
	case <-time.After(300 * time.Millisecond):
		t.Fatal("board-1 subscriber did not receive notification")
	}

	time.Sleep(50 * time.Millisecond)
	select {
	case <-ch2:
		t.Fatal("board-2 subscriber should not have received board-1 notification")
	default:
	}
}

func TestFakeNotifier_RecordsNotifications(t *testing.T) {
	f := &hub.FakeNotifier{}

	f.Notify("board-a")
	f.Notify("board-b")
	f.Notify("board-a")

	if !f.WasNotified("board-a") {
		t.Error("expected board-a to be notified")
	}
	if !f.WasNotified("board-b") {
		t.Error("expected board-b to be notified")
	}
	if f.NotifyCount() != 3 {
		t.Errorf("expected 3 notifications, got %d", f.NotifyCount())
	}

	f.Reset()
	if f.NotifyCount() != 0 {
		t.Error("Reset should clear notifications")
	}
}
