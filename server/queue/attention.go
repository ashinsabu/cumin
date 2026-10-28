package queue

import (
	"fmt"
	"sort"
	"time"
)

const (
	DayBudgetMinutes    = 8 * 60 // planned work above this is a bad sign for one day
	defaultEstimateMins = 30     // for unestimated items when simulating the day
	watchSlackMins      = 60     // less than this to spare => "watch"
	AttentionCalm       = "calm"
	AttentionWatch      = "watch"
	AttentionPulse      = "pulse"
	quickTaskLifetime   = 24 * time.Hour
	maxPulsingItems     = 2
)

// Attention is the computed emphasis for a queue item. It is never stored: it depends on "now".
type Attention struct {
	Level  string `json:"level"`
	Reason string `json:"reason,omitempty"`
	// RoomMinutes is the time left for this item once the work ahead of it is done (until end of day or its expiry).
	RoomMinutes int `json:"room_minutes"`
}

// Summary describes the day's load for the whole queue.
type Summary struct {
	PlannedMinutes   int `json:"planned_minutes"`   // sum of known estimates
	BudgetMinutes    int `json:"budget_minutes"`    // DayBudgetMinutes
	UnestimatedCount int `json:"unestimated_count"` // items without an estimate
	MinutesLeftToday int `json:"minutes_left_today"`
}

// EndOfDay is the next local midnight in loc.
func EndOfDay(now time.Time, loc *time.Location) time.Time {
	n := now.In(loc)
	return time.Date(n.Year(), n.Month(), n.Day()+1, 0, 0, 0, 0, loc)
}

// ComputeAttention simulates working the queue in order (highest urgency first) starting now.
// Each item must finish before min(its own 24h expiry, end of day); otherwise it cannot fit and
// is a pulse candidate. P0/P1 only influence the order, never the level directly.
// At most min(maxPulsingItems, n/2) items pulse, so the whole queue never pulses; extra candidates
// are demoted to "watch". Stale (expired) items are calm. Fills q.Attention and returns the summary.
func ComputeAttention(items []QueueItem, now time.Time, loc *time.Location) Summary {
	eod := EndOfDay(now, loc)
	sum := Summary{BudgetMinutes: DayBudgetMinutes, MinutesLeftToday: int(eod.Sub(now).Minutes())}

	order := make([]int, 0, len(items))
	for i := range items {
		items[i].Attention = Attention{Level: AttentionCalm}
		if !items[i].CreatedAt.Add(quickTaskLifetime).After(now) {
			continue // expired: lives in the stale section
		}
		order = append(order, i)
		if items[i].EstimateMinutes != nil {
			sum.PlannedMinutes += *items[i].EstimateMinutes
		} else {
			sum.UnestimatedCount++
		}
	}
	sort.SliceStable(order, func(a, b int) bool { return items[order[a]].UrgencyScore > items[order[b]].UrgencyScore })

	cursor := now
	var aheadMins int
	var pulseCandidates []int
	for _, idx := range order {
		it := &items[idx]
		est := defaultEstimateMins
		if it.EstimateMinutes != nil {
			est = *it.EstimateMinutes
		}
		finish := cursor.Add(time.Duration(est) * time.Minute)
		expires := it.CreatedAt.Add(quickTaskLifetime)
		limit, byExpiry := eod, false
		if expires.Before(eod) {
			limit, byExpiry = expires, true
		}
		slack := limit.Sub(finish)
		room := max(int(limit.Sub(cursor).Minutes()), 0)
		switch {
		case slack < 0:
			it.Attention = Attention{Level: AttentionPulse, Reason: reasonCannotFit(est, aheadMins, limit.Sub(now), byExpiry)}
			pulseCandidates = append(pulseCandidates, idx)
		case slack < watchSlackMins*time.Minute:
			it.Attention = Attention{Level: AttentionWatch, Reason: fmt.Sprintf("Only %s to spare", fmtMins(int(slack.Minutes())))}
		}
		it.Attention.RoomMinutes = room
		cursor = finish
		aheadMins += est
	}

	cap := len(order) / 2
	if cap > maxPulsingItems {
		cap = maxPulsingItems
	}
	for i, idx := range pulseCandidates {
		if i >= cap {
			items[idx].Attention.Level = AttentionWatch
		}
	}
	return sum
}

func reasonCannotFit(est, aheadMins int, left time.Duration, byExpiry bool) string {
	leftStr := fmtMins(int(left.Minutes()))
	if left < 0 {
		leftStr = "0m"
	}
	switch {
	case byExpiry && aheadMins == 0:
		return fmt.Sprintf("Expires in %s, needs %s", leftStr, fmtMins(est))
	case byExpiry:
		return fmt.Sprintf("Expires in %s, %s of work ahead", leftStr, fmtMins(aheadMins))
	case aheadMins == 0:
		return fmt.Sprintf("Needs %s, %s left today", fmtMins(est), leftStr)
	default:
		return fmt.Sprintf("%s of work ahead, %s left today", fmtMins(aheadMins), leftStr)
	}
}

func fmtMins(m int) string {
	if m < 60 {
		return fmt.Sprintf("%dm", m)
	}
	if m%60 == 0 {
		return fmt.Sprintf("%dh", m/60)
	}
	return fmt.Sprintf("%dh %dm", m/60, m%60)
}
