package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"time"

	"github.com/livekit/protocol/auth"
)

type Handler struct {
	key, secret string
}

func (h *Handler) handle(w http.ResponseWriter, r *http.Request) {
	log.Printf("Request from %s", r.RemoteAddr)

	// Set the CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

	// Handle preflight request (CORS)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	roomName := r.URL.Query().Get("roomName")
	name := r.URL.Query().Get("name")
	identity := r.URL.Query().Get("identity")

	log.Printf("roomName: %s, name: %s, identity: %s", roomName, name, identity)

	if roomName == "" || name == "" || identity == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	token, err := getJoinToken(h.key, h.secret, roomName, identity, name)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	res := Response{token}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func main() {
	key := os.Getenv("LIVEKIT_KEY")
	secret := os.Getenv("LIVEKIT_SECRET")

	// Check if the key and secret are empty.
	if key == "" || secret == "" {
		log.Fatal("LIVEKIT_KEY and LIVEKIT_SECRET environment variables must be set")
	}

	log.Printf("LIVEKIT_KEY: %s and LIVEKIT_SECRET %s", key, secret)

	handler := &Handler{
		key:    key,
		secret: secret,
	}

	http.HandleFunc("/token", handler.handle)
	log.Fatal(http.ListenAndServe(":8080", nil))
}

type Response struct {
	Token string `json:"accessToken"`
}

func getJoinToken(apiKey, apiSecret, room, identity, name string) (string, error) {
	at := auth.NewAccessToken(apiKey, apiSecret)

	canPublish := true
	canSubscribe := true
	grant := &auth.VideoGrant{
		RoomJoin:     true,
		RoomCreate:   true,
		CanPublish:   &canPublish,
		CanSubscribe: &canSubscribe,
		Room:         room,
	}

	at.AddGrant(grant).
		SetIdentity(identity).
		SetValidFor(time.Hour).
		SetName(name)

	return at.ToJWT()
}
