package service

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	wechatMPTokenURL   = "https://api.weixin.qq.com/cgi-bin/token"
	wechatMPQRCreateURL = "https://api.weixin.qq.com/cgi-bin/qrcode/create"
	wechatMPShowQRURL  = "https://mp.weixin.qq.com/cgi-bin/showqrcode"
	wechatMPQRExpire   = 5 * time.Minute
)

var (
	wechatAccessTokenMu     sync.Mutex
	wechatAccessToken       string
	wechatAccessTokenExpire time.Time
)

type wechatAPIError struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

func (e wechatAPIError) Error() string {
	if e.ErrCode == 0 {
		return ""
	}
	return fmt.Sprintf("wechat api error %d: %s", e.ErrCode, e.ErrMsg)
}

type wechatAccessTokenResponse struct {
	wechatAPIError
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

type wechatQRCreateResponse struct {
	wechatAPIError
	Ticket        string `json:"ticket"`
	ExpireSeconds int    `json:"expire_seconds"`
	URL           string `json:"url"`
}

// WeChatMPConfigured reports whether native Official Account credentials are ready.
func WeChatMPConfigured() bool {
	return strings.TrimSpace(common.WeChatAppID) != "" &&
		strings.TrimSpace(common.WeChatAppSecret) != "" &&
		strings.TrimSpace(common.WeChatToken) != ""
}

// WeChatLegacyConfigured reports whether the external verification-code server is configured.
func WeChatLegacyConfigured() bool {
	return strings.TrimSpace(common.WeChatServerAddress) != ""
}

// WeChatNativeEnabled is true when WeChat auth is on and native MP credentials exist.
func WeChatNativeEnabled() bool {
	return common.WeChatAuthEnabled && WeChatMPConfigured()
}

// WeChatLegacyEnabled is true when WeChat auth is on and only the legacy code server is available.
func WeChatLegacyEnabled() bool {
	return common.WeChatAuthEnabled && WeChatLegacyConfigured() && !WeChatMPConfigured()
}

// WeChatAuthMode returns "native", "legacy", or "".
func WeChatAuthMode() string {
	if !common.WeChatAuthEnabled {
		return ""
	}
	if WeChatMPConfigured() {
		return "native"
	}
	if WeChatLegacyConfigured() {
		return "legacy"
	}
	return ""
}

func GetWeChatAccessToken() (string, error) {
	if !WeChatMPConfigured() {
		return "", errors.New("wechat official account is not configured")
	}

	wechatAccessTokenMu.Lock()
	defer wechatAccessTokenMu.Unlock()

	if wechatAccessToken != "" && time.Now().Before(wechatAccessTokenExpire) {
		return wechatAccessToken, nil
	}

	query := url.Values{}
	query.Set("grant_type", "client_credential")
	query.Set("appid", strings.TrimSpace(common.WeChatAppID))
	query.Set("secret", strings.TrimSpace(common.WeChatAppSecret))

	req, err := http.NewRequest(http.MethodGet, wechatMPTokenURL+"?"+query.Encode(), nil)
	if err != nil {
		return "", err
	}
	resp, err := GetHttpClient().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var result wechatAccessTokenResponse
	if err := common.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if result.ErrCode != 0 {
		return "", result.wechatAPIError
	}
	if result.AccessToken == "" {
		return "", errors.New("wechat access_token is empty")
	}

	expiresIn := result.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 7200
	}
	// Refresh a bit early to avoid edge expiry.
	skew := 120
	if expiresIn <= skew+30 {
		skew = expiresIn / 5
	}
	wechatAccessToken = result.AccessToken
	wechatAccessTokenExpire = time.Now().Add(time.Duration(expiresIn-skew) * time.Second)
	return wechatAccessToken, nil
}

func CreateWeChatTempQRCode(scene string, expire time.Duration) (ticket string, qrURL string, expireSeconds int, err error) {
	scene = strings.TrimSpace(scene)
	if scene == "" {
		return "", "", 0, errors.New("scene is required")
	}
	if expire <= 0 {
		expire = wechatMPQRExpire
	}
	expireSeconds = int(expire.Seconds())
	if expireSeconds < 30 {
		expireSeconds = 30
	}
	if expireSeconds > 2592000 {
		expireSeconds = 2592000
	}

	token, err := GetWeChatAccessToken()
	if err != nil {
		return "", "", 0, err
	}

	payload := map[string]any{
		"expire_seconds": expireSeconds,
		"action_name":    "QR_STR_SCENE",
		"action_info": map[string]any{
			"scene": map[string]any{
				"scene_str": scene,
			},
		},
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return "", "", 0, err
	}

	req, err := http.NewRequest(
		http.MethodPost,
		fmt.Sprintf("%s?access_token=%s", wechatMPQRCreateURL, url.QueryEscape(token)),
		bytes.NewReader(body),
	)
	if err != nil {
		return "", "", 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := GetHttpClient().Do(req)
	if err != nil {
		return "", "", 0, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", "", 0, err
	}
	var result wechatQRCreateResponse
	if err := common.Unmarshal(respBody, &result); err != nil {
		return "", "", 0, err
	}
	if result.ErrCode != 0 {
		// Token might be stale; force refresh once.
		if result.ErrCode == 40001 || result.ErrCode == 42001 {
			invalidateWeChatAccessToken()
		}
		return "", "", 0, result.wechatAPIError
	}
	if result.Ticket == "" {
		return "", "", 0, errors.New("wechat qr ticket is empty")
	}

	qrURL = wechatMPShowQRURL + "?ticket=" + url.QueryEscape(result.Ticket)
	if result.ExpireSeconds > 0 {
		expireSeconds = result.ExpireSeconds
	}
	return result.Ticket, qrURL, expireSeconds, nil
}

func invalidateWeChatAccessToken() {
	wechatAccessToken = ""
	wechatAccessTokenExpire = time.Time{}
}

// VerifyWeChatSignature validates the WeChat server URL/message signature.
func VerifyWeChatSignature(signature, timestamp, nonce string) bool {
	token := strings.TrimSpace(common.WeChatToken)
	if token == "" || signature == "" || timestamp == "" || nonce == "" {
		return false
	}
	values := []string{token, timestamp, nonce}
	sort.Strings(values)
	sum := sha1.Sum([]byte(strings.Join(values, "")))
	return fmt.Sprintf("%x", sum) == signature
}

// VerifyWeChatMsgSignature validates encrypted callback signatures.
func VerifyWeChatMsgSignature(msgSignature, timestamp, nonce, encrypt string) bool {
	token := strings.TrimSpace(common.WeChatToken)
	if token == "" || msgSignature == "" || timestamp == "" || nonce == "" || encrypt == "" {
		return false
	}
	values := []string{token, timestamp, nonce, encrypt}
	sort.Strings(values)
	sum := sha1.Sum([]byte(strings.Join(values, "")))
	return fmt.Sprintf("%x", sum) == msgSignature
}

// WeChatIncomingMessage is the subset of Official Account callback fields we need.
type WeChatIncomingMessage struct {
	ToUserName   string `xml:"ToUserName"`
	FromUserName string `xml:"FromUserName"`
	CreateTime   int64  `xml:"CreateTime"`
	MsgType      string `xml:"MsgType"`
	Event        string `xml:"Event"`
	EventKey     string `xml:"EventKey"`
	Ticket       string `xml:"Ticket"`
	Content      string `xml:"Content"`
	MsgId        int64  `xml:"MsgId"`
	Encrypt      string `xml:"Encrypt"`
}

// ParseWeChatCallbackXML parses plain or AES-encrypted Official Account callbacks.
func ParseWeChatCallbackXML(body []byte, msgSignature, timestamp, nonce string) (*WeChatIncomingMessage, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil, errors.New("empty wechat callback body")
	}

	var plain WeChatIncomingMessage
	if err := xml.Unmarshal(body, &plain); err != nil {
		return nil, err
	}
	if plain.Encrypt == "" {
		return &plain, nil
	}

	if !VerifyWeChatMsgSignature(msgSignature, timestamp, nonce, plain.Encrypt) {
		return nil, errors.New("invalid wechat msg signature")
	}
	decrypted, err := decryptWeChatMessage(plain.Encrypt)
	if err != nil {
		return nil, err
	}
	var message WeChatIncomingMessage
	if err := xml.Unmarshal(decrypted, &message); err != nil {
		return nil, err
	}
	return &message, nil
}

func decryptWeChatMessage(encrypt string) ([]byte, error) {
	encodingAESKey := strings.TrimSpace(common.WeChatEncodingAESKey)
	if encodingAESKey == "" {
		return nil, errors.New("WeChatEncodingAESKey is required for encrypted callbacks")
	}
	aesKey, err := base64.StdEncoding.DecodeString(encodingAESKey + "=")
	if err != nil {
		return nil, fmt.Errorf("invalid WeChatEncodingAESKey: %w", err)
	}
	if len(aesKey) != 32 {
		return nil, errors.New("WeChatEncodingAESKey must decode to 32 bytes")
	}

	cipherData, err := base64.StdEncoding.DecodeString(encrypt)
	if err != nil {
		return nil, err
	}
	if len(cipherData) < aes.BlockSize || len(cipherData)%aes.BlockSize != 0 {
		return nil, errors.New("invalid wechat cipher text length")
	}

	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return nil, err
	}
	iv := aesKey[:aes.BlockSize]
	mode := cipher.NewCBCDecrypter(block, iv)
	plain := make([]byte, len(cipherData))
	mode.CryptBlocks(plain, cipherData)
	plain, err = pkcs7Unpad(plain, aes.BlockSize)
	if err != nil {
		return nil, err
	}
	if len(plain) < 20 {
		return nil, errors.New("wechat decrypted message too short")
	}

	msgLen := binary.BigEndian.Uint32(plain[16:20])
	if int(msgLen) < 0 || 20+int(msgLen) > len(plain) {
		return nil, errors.New("invalid wechat message length")
	}
	message := plain[20 : 20+msgLen]
	appID := string(plain[20+msgLen:])
	if expected := strings.TrimSpace(common.WeChatAppID); expected != "" && appID != expected {
		return nil, errors.New("wechat appid mismatch in encrypted message")
	}
	return message, nil
}

func pkcs7Unpad(data []byte, blockSize int) ([]byte, error) {
	if blockSize <= 0 || len(data) == 0 || len(data)%blockSize != 0 {
		return nil, errors.New("invalid pkcs7 data")
	}
	pad := int(data[len(data)-1])
	if pad == 0 || pad > blockSize || pad > len(data) {
		return nil, errors.New("invalid pkcs7 padding")
	}
	for i := 0; i < pad; i++ {
		if data[len(data)-1-i] != byte(pad) {
			return nil, errors.New("invalid pkcs7 padding")
		}
	}
	return data[:len(data)-pad], nil
}

// ExtractWeChatScene returns the scene_str from subscribe/SCAN EventKey values.
func ExtractWeChatScene(event, eventKey string) string {
	event = strings.ToUpper(strings.TrimSpace(event))
	eventKey = strings.TrimSpace(eventKey)
	if eventKey == "" {
		return ""
	}
	if event == "SUBSCRIBE" {
		const prefix = "qrscene_"
		if strings.HasPrefix(eventKey, prefix) {
			return strings.TrimSpace(eventKey[len(prefix):])
		}
		return ""
	}
	if event == "SCAN" {
		return eventKey
	}
	return ""
}

// BuildWeChatTextReply builds a passive text reply for Official Account callbacks.
func BuildWeChatTextReply(toUser, fromUser, content string) string {
	type xmlText struct {
		XMLName      xml.Name `xml:"xml"`
		ToUserName   cdata    `xml:"ToUserName"`
		FromUserName cdata    `xml:"FromUserName"`
		CreateTime   int64    `xml:"CreateTime"`
		MsgType      cdata    `xml:"MsgType"`
		Content      cdata    `xml:"Content"`
	}
	out, err := xml.Marshal(xmlText{
		ToUserName:   cdata(toUser),
		FromUserName: cdata(fromUser),
		CreateTime:   time.Now().Unix(),
		MsgType:      cdata("text"),
		Content:      cdata(content),
	})
	if err != nil {
		return "success"
	}
	return string(out)
}

type cdata string

func (c cdata) MarshalXML(e *xml.Encoder, start xml.StartElement) error {
	return e.EncodeElement(struct {
		string `xml:",cdata"`
	}{string(c)}, start)
}
