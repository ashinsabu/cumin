package auth

import (
	"strings"
	"testing"
)

func TestValidateEmail(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"a@b.co", "a@b.co", false},
		{"  Mixed.Case+tag@Example.COM ", "mixed.case+tag@example.com", false},
		{"", "", true},
		{"   ", "", true},
		{"plain", "", true},
		{"a@localhost", "", true},
		{"@b.co", "", true},
		{"Eve <eve@b.co>", "", true},
		{"a@b.co, c@d.co", "", true},
		{strings.Repeat("a", 250) + "@b.co", "", true},
	}
	for _, c := range cases {
		got, err := validateEmail(c.in)
		if (err != nil) != c.wantErr || got != c.want {
			t.Errorf("validateEmail(%q) = %q, %v; want %q, err=%v", c.in, got, err, c.want, c.wantErr)
		}
	}
}

func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name    string
		pw      string
		wantErr bool
	}{
		{"minimum", strings.Repeat("x", 10), false},
		{"maximum", strings.Repeat("x", 128), false},
		{"one short", strings.Repeat("x", 9), true},
		{"one long", strings.Repeat("x", 129), true},
		{"empty", "", true},
		{"multibyte counts runes", strings.Repeat("é", 10), false},
		{"multibyte over max", strings.Repeat("é", 129), true},
		{"spaces allowed", "pass word with spaces", false},
	}
	for _, c := range cases {
		if err := validatePassword(c.pw); (err != nil) != c.wantErr {
			t.Errorf("%s: err = %v, wantErr %v", c.name, err, c.wantErr)
		}
	}
}

func TestCleanName(t *testing.T) {
	if got := cleanName("  Ada  ", "x@y.co"); got != "Ada" {
		t.Errorf("trimmed = %q", got)
	}
	if got := cleanName("   ", "ada.l@y.co"); got != "ada.l" {
		t.Errorf("fallback to email local part = %q", got)
	}
	if got := cleanName(strings.Repeat("é", 150), "x@y.co"); len([]rune(got)) != maxNameLen {
		t.Errorf("rune length = %d, want %d", len([]rune(got)), maxNameLen)
	}
}

func TestDefaultPrefix(t *testing.T) {
	cases := map[string]string{"Grace Hopper": "GRA", "ab": "AB", "  x ": "X", "": "USR", "   ": "USR"}
	for in, want := range cases {
		if got := defaultPrefix(in); got != want {
			t.Errorf("defaultPrefix(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTokenHelpers(t *testing.T) {
	a, err := randomToken()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := randomToken()
	if a == b || len(a) < 43 {
		t.Errorf("tokens must be unique and at least 256 bits: %q %q", a, b)
	}
	if hashToken(a) != hashToken(a) || hashToken(a) == hashToken(b) {
		t.Error("hashToken must be deterministic and collision-free for distinct inputs")
	}
	if hashToken(a) == a {
		t.Error("hashToken returned its input")
	}
}
