package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	IDPrefix    string `json:"id_prefix"`
	AvatarURL   string `json:"avatar_url"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	mux.HandleFunc("GET /api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		user := User{
			ID:          "test-user-001",
			Email:       "ashin.sabu3@gmail.com",
			DisplayName: "Ashin Sabu",
			IDPrefix:    "ASH",
			AvatarURL:   "",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	})

	log.Printf("cumin server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
