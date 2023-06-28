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

type OpenIDTokenType struct {
}

type SFURequest struct {
	Room           string          `json:"room"`
	OpenIDToken    OpenIDTokenType `json:"openid_token"`
	DeviceID       string          `json:"device_id"`
	RemoveMeUserID string          `json:"remove_me_user_id"` // we'll get this from OIDC
}

type SFUResponse struct {
	URL string `json:"url"`
	JWT string `json:"jwt"`
}

func (h *Handler) handle(w http.ResponseWriter, r *http.Request) {
	log.Printf("Request from %s", r.RemoteAddr)

	// Set the CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST")
	w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token")

	// Handle preflight request (CORS)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	} else if r.Method == "POST" {
		var body SFURequest
		err := json.NewDecoder(r.Body).Decode(&body)
		if err != nil {
			log.Printf("Error decoding JSON: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		if body.Room == "" {
			log.Printf("Request missing room")
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		token, err := getJoinToken(h.key, h.secret, body.Room, body.RemoveMeUserID+":"+body.DeviceID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		res := SFUResponse{URL: "http://localhost:7880/", JWT: token}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
	} else {
		w.WriteHeader(http.StatusMethodNotAllowed)
	}

	/*
		roomName := r.URL.Query().Get("roomName")
		name := r.URL.Query().Get("name")
		identity := r.URL.Query().Get("identity")

		log.Printf("roomName: %s, name: %s, identity: %s", roomName, name, identity)

		if roomName == "" || name == "" || identity == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
	*/
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

	http.HandleFunc("/sfu/get", handler.handle)
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func getJoinToken(apiKey, apiSecret, room, identity string) (string, error) {
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
		SetValidFor(time.Hour)

	return at.ToJWT()
}
