package auth

import "time"

type User struct {
	ID          string    `json:"id"`
	GoogleID    string    `json:"-"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url"`
	IDPrefix    string    `json:"id_prefix"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
