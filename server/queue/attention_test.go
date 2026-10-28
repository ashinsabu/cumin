package queue

import (
	"strings"
	"testing"
	"time"
)

func mins(n int) *int { return &n }

func mk(id string, urgency float64, est *int, createdAgo time.Duration, now time.Time) QueueItem {
	return QueueItem{ID: id, UrgencyScore: urgency, EstimateMinutes: est, CreatedAt: now.Add(-createdAgo)}
}

func levels(items []QueueItem) map[string]string {
	out := map[string]string{}
	for _, it := range items {
		out[it.ID] = it.Attention.Level
	}
	return out
}

// 8pm, day ends at midnight: a 5h task cannot fit; a 30m task can.
func TestAttention_PulsesWhenWorkCannotFitBeforeEndOfDay(t *testing.T) {
	now := time.Date(2026, 10, 28, 20, 0, 0, 0, time.UTC)
	items := []QueueItem{mk("big", 9, mins(300), time.Hour, now), mk("small", 1, mins(30), time.Hour, now), mk("other", 0, mins(30), time.Hour, now)}
	ComputeAttention(items, now, time.UTC)
	lv := levels(items)
	if lv["big"] != AttentionPulse {
		t.Fatalf("big = %s, want pulse", lv["big"])
	}
	if !strings.Contains(items[0].Attention.Reason, "Needs 5h, 4h left today") {
		t.Fatalf("reason = %q", items[0].Attention.Reason)
	}
}

// Regression guard for the owner rule: the whole queue must never pulse.
func TestAttention_NeverPulsesWholeQueue(t *testing.T) {
	now := time.Date(2026, 10, 28, 23, 30, 0, 0, time.UTC) // 30m left, everything is infeasible
	for n := 1; n <= 7; n++ {
		items := make([]QueueItem, n)
		for i := range items {
			items[i] = mk(string(rune('a'+i)), float64(10-i), mins(120), time.Hour, now)
		}
		ComputeAttention(items, now, time.UTC)
		pulsing := 0
		for _, it := range items {
			if it.Attention.Level == AttentionPulse {
				pulsing++
			}
		}
		if pulsing >= n || pulsing > maxPulsingItems {
			t.Fatalf("n=%d: %d pulsing", n, pulsing)
		}
	}
}

// An item can be limited by its own 24h expiry before midnight.
func TestAttention_ExpiryBeforeMidnightLimitsTheItem(t *testing.T) {
	now := time.Date(2026, 10, 28, 10, 0, 0, 0, time.UTC)
	// created 23h ago => expires in 1h; needs 2h
	items := []QueueItem{mk("old", 5, mins(120), 23*time.Hour, now), mk("x", 1, mins(10), time.Hour, now), mk("y", 0, mins(10), time.Hour, now)}
	ComputeAttention(items, now, time.UTC)
	if items[0].Attention.Level != AttentionPulse || !strings.HasPrefix(items[0].Attention.Reason, "Expires in 1h") {
		t.Fatalf("got %+v", items[0].Attention)
	}
}

func TestAttention_SummaryCountsLoadAndUnestimated(t *testing.T) {
	now := time.Date(2026, 10, 28, 9, 0, 0, 0, time.UTC)
	items := []QueueItem{mk("a", 1, mins(90), time.Hour, now), mk("b", 1, nil, time.Hour, now), mk("stale", 1, mins(600), 30*time.Hour, now)}
	sum := ComputeAttention(items, now, time.UTC)
	if sum.PlannedMinutes != 90 || sum.UnestimatedCount != 1 || sum.BudgetMinutes != 480 || sum.MinutesLeftToday != 15*60 {
		t.Fatalf("summary = %+v", sum)
	}
	if items[2].Attention.Level != AttentionCalm {
		t.Fatalf("stale item should be calm")
	}
}

func TestAttention_EndOfDayUsesTheBrowserTimezone(t *testing.T) {
	ist := time.FixedZone("IST", 5*3600+1800)
	now := time.Date(2026, 10, 28, 20, 0, 0, 0, time.UTC) // 01:30 on the 29th in IST
	got := EndOfDay(now, ist)
	want := time.Date(2026, 10, 30, 0, 0, 0, 0, ist)
	if !got.Equal(want) {
		t.Fatalf("EndOfDay = %v, want %v", got, want)
	}
}

// RoomMinutes is what the UI shows as "(2h left today)": time left once the work ahead is done, floored at 0.
func TestAttention_RoomIsTimeLeftAfterWorkAhead(t *testing.T) {
	now := time.Date(2026, 10, 28, 20, 0, 0, 0, time.UTC) // 4h to midnight
	items := []QueueItem{mk("a", 9, mins(120), time.Hour, now), mk("b", 5, mins(180), time.Hour, now), mk("c", 1, mins(30), time.Hour, now)}
	ComputeAttention(items, now, time.UTC)
	want := map[string]int{"a": 240, "b": 120, "c": 0} // b ends past midnight, so c has no room
	for _, it := range items {
		if it.Attention.RoomMinutes != want[it.ID] {
			t.Errorf("%s room = %d, want %d", it.ID, it.Attention.RoomMinutes, want[it.ID])
		}
	}
}
