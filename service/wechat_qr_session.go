package service

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/go-redis/redis/v8"
)

const (
	WeChatQRIntentLogin = "login"
	WeChatQRIntentBind  = "bind"

	WeChatQRStatusPending   = "pending"
	WeChatQRStatusConfirmed = "confirmed"
	WeChatQRStatusConsumed  = "consumed"
	WeChatQRStatusExpired   = "expired"

	wechatQRSessionKeyPrefix = "wechat_qr_session:"
	wechatQRDefaultTTL       = 5 * time.Minute
	wechatQRSceneBytes       = 18
)

var (
	ErrWeChatQRSessionNotFound = errors.New("wechat qr session not found")
	ErrWeChatQRSessionExpired  = errors.New("wechat qr session expired")
	ErrWeChatQRSessionInvalid  = errors.New("wechat qr session invalid")
	ErrWeChatQRSessionConsumed = errors.New("wechat qr session already consumed")

	wechatQRMemoryMu sync.Mutex
	wechatQRMemory   = map[string]wechatQRMemoryItem{}
)

type wechatQRMemoryItem struct {
	session   WeChatQRSession
	expiresAt time.Time
}

// WeChatQRSession is a short-lived Official Account scan login/bind ceremony.
type WeChatQRSession struct {
	Scene      string `json:"scene"`
	Intent     string `json:"intent"`
	Status     string `json:"status"`
	OpenID     string `json:"openid,omitempty"`
	Ticket     string `json:"ticket,omitempty"`
	QRCodeURL  string `json:"qrcode_url,omitempty"`
	BindUserID int    `json:"bind_user_id,omitempty"`
	UserID     int    `json:"user_id,omitempty"`
	Message    string `json:"message,omitempty"`
	CreatedAt  int64  `json:"created_at"`
	ExpireAt   int64  `json:"expire_at"`
}

type WeChatQRSessionCreate struct {
	Intent     string
	BindUserID int
	TTL        time.Duration
}

func NewWeChatQRScene() (string, error) {
	buf := make([]byte, wechatQRSceneBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	// URL-safe, compact, fits WeChat scene_str (max 64).
	return "wq_" + base64.RawURLEncoding.EncodeToString(buf), nil
}

func CreateWeChatQRSession(input WeChatQRSessionCreate) (*WeChatQRSession, error) {
	intent := strings.TrimSpace(input.Intent)
	if intent == "" {
		intent = WeChatQRIntentLogin
	}
	if intent != WeChatQRIntentLogin && intent != WeChatQRIntentBind {
		return nil, ErrWeChatQRSessionInvalid
	}
	if intent == WeChatQRIntentBind && input.BindUserID <= 0 {
		return nil, ErrWeChatQRSessionInvalid
	}

	ttl := input.TTL
	if ttl <= 0 {
		ttl = wechatQRDefaultTTL
	}
	scene, err := NewWeChatQRScene()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	session := &WeChatQRSession{
		Scene:      scene,
		Intent:     intent,
		Status:     WeChatQRStatusPending,
		BindUserID: input.BindUserID,
		CreatedAt:  now.Unix(),
		ExpireAt:   now.Add(ttl).Unix(),
	}
	if err := saveWeChatQRSession(session, ttl); err != nil {
		return nil, err
	}
	return session, nil
}

func GetWeChatQRSession(scene string) (*WeChatQRSession, error) {
	scene = strings.TrimSpace(scene)
	if scene == "" {
		return nil, ErrWeChatQRSessionInvalid
	}
	session, err := loadWeChatQRSession(scene)
	if err != nil {
		return nil, err
	}
	if session.ExpireAt > 0 && time.Now().Unix() >= session.ExpireAt {
		_ = DeleteWeChatQRSession(scene)
		return nil, ErrWeChatQRSessionExpired
	}
	if session.Status == WeChatQRStatusConsumed {
		return nil, ErrWeChatQRSessionConsumed
	}
	return session, nil
}

func ConfirmWeChatQRSession(scene, openID string) (*WeChatQRSession, error) {
	scene = strings.TrimSpace(scene)
	openID = strings.TrimSpace(openID)
	if scene == "" || openID == "" {
		return nil, ErrWeChatQRSessionInvalid
	}

	session, err := GetWeChatQRSession(scene)
	if err != nil {
		return nil, err
	}
	if session.Status == WeChatQRStatusConfirmed {
		// Idempotent confirm for duplicate WeChat event delivery.
		if session.OpenID == "" || session.OpenID == openID {
			return session, nil
		}
		return nil, ErrWeChatQRSessionInvalid
	}
	if session.Status != WeChatQRStatusPending {
		return nil, ErrWeChatQRSessionInvalid
	}

	session.Status = WeChatQRStatusConfirmed
	session.OpenID = openID
	ttl := time.Until(time.Unix(session.ExpireAt, 0))
	if ttl <= 0 {
		return nil, ErrWeChatQRSessionExpired
	}
	if err := saveWeChatQRSession(session, ttl); err != nil {
		return nil, err
	}
	return session, nil
}

func AttachWeChatQRSessionUser(scene string, userID int, message string) (*WeChatQRSession, error) {
	session, err := GetWeChatQRSession(scene)
	if err != nil {
		return nil, err
	}
	if session.Status != WeChatQRStatusConfirmed {
		return nil, ErrWeChatQRSessionInvalid
	}
	session.UserID = userID
	if message != "" {
		session.Message = message
	}
	ttl := time.Until(time.Unix(session.ExpireAt, 0))
	if ttl <= 0 {
		return nil, ErrWeChatQRSessionExpired
	}
	if err := saveWeChatQRSession(session, ttl); err != nil {
		return nil, err
	}
	return session, nil
}

func MarkWeChatQRSessionMessage(scene, message string) error {
	session, err := GetWeChatQRSession(scene)
	if err != nil {
		return err
	}
	session.Message = message
	ttl := time.Until(time.Unix(session.ExpireAt, 0))
	if ttl <= 0 {
		return ErrWeChatQRSessionExpired
	}
	return saveWeChatQRSession(session, ttl)
}

func UpdateWeChatQRSessionTicket(scene, ticket, qrURL string, expireAt int64) error {
	session, err := GetWeChatQRSession(scene)
	if err != nil {
		return err
	}
	session.Ticket = ticket
	session.QRCodeURL = qrURL
	if expireAt > 0 {
		session.ExpireAt = expireAt
	}
	ttl := time.Until(time.Unix(session.ExpireAt, 0))
	if ttl <= 0 {
		ttl = wechatQRDefaultTTL
	}
	return saveWeChatQRSession(session, ttl)
}

func ConsumeWeChatQRSession(scene, intent string) (*WeChatQRSession, error) {
	session, err := GetWeChatQRSession(scene)
	if err != nil {
		return nil, err
	}
	if intent != "" && session.Intent != intent {
		return nil, ErrWeChatQRSessionInvalid
	}
	if session.Status != WeChatQRStatusConfirmed {
		return nil, ErrWeChatQRSessionInvalid
	}
	if strings.TrimSpace(session.OpenID) == "" {
		return nil, ErrWeChatQRSessionInvalid
	}
	session.Status = WeChatQRStatusConsumed
	// Keep briefly so a concurrent poll can observe consumption if needed, then delete.
	_ = saveWeChatQRSession(session, 30*time.Second)
	_ = DeleteWeChatQRSession(scene)
	session.Status = WeChatQRStatusConsumed
	return session, nil
}

func DeleteWeChatQRSession(scene string) error {
	scene = strings.TrimSpace(scene)
	if scene == "" {
		return nil
	}
	if common.RedisEnabled && common.RDB != nil {
		return common.RedisDel(wechatQRSessionKeyPrefix + scene)
	}
	wechatQRMemoryMu.Lock()
	delete(wechatQRMemory, scene)
	wechatQRMemoryMu.Unlock()
	return nil
}

func saveWeChatQRSession(session *WeChatQRSession, ttl time.Duration) error {
	if session == nil || strings.TrimSpace(session.Scene) == "" {
		return ErrWeChatQRSessionInvalid
	}
	if ttl <= 0 {
		ttl = wechatQRDefaultTTL
	}
	raw, err := common.Marshal(session)
	if err != nil {
		return err
	}
	if common.RedisEnabled && common.RDB != nil {
		return common.RedisSet(wechatQRSessionKeyPrefix+session.Scene, string(raw), ttl)
	}

	wechatQRMemoryMu.Lock()
	wechatQRMemory[session.Scene] = wechatQRMemoryItem{
		session:   *session,
		expiresAt: time.Now().Add(ttl),
	}
	// Opportunistic cleanup.
	now := time.Now()
	for key, item := range wechatQRMemory {
		if now.After(item.expiresAt) {
			delete(wechatQRMemory, key)
		}
	}
	wechatQRMemoryMu.Unlock()
	return nil
}

func loadWeChatQRSession(scene string) (*WeChatQRSession, error) {
	if common.RedisEnabled && common.RDB != nil {
		raw, err := common.RedisGet(wechatQRSessionKeyPrefix + scene)
		if err != nil {
			if errors.Is(err, redis.Nil) {
				return nil, ErrWeChatQRSessionNotFound
			}
			return nil, err
		}
		var session WeChatQRSession
		if err := common.UnmarshalJsonStr(raw, &session); err != nil {
			return nil, err
		}
		return &session, nil
	}

	wechatQRMemoryMu.Lock()
	defer wechatQRMemoryMu.Unlock()
	item, ok := wechatQRMemory[scene]
	if !ok {
		return nil, ErrWeChatQRSessionNotFound
	}
	if time.Now().After(item.expiresAt) {
		delete(wechatQRMemory, scene)
		return nil, ErrWeChatQRSessionExpired
	}
	session := item.session
	return &session, nil
}
