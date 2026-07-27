package controller

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const wechatQRLoginTTL = 5 * time.Minute

type wechatLoginResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    string `json:"data"`
}

type wechatBindRequest struct {
	Code string `json:"code"`
}

func getWeChatIdByCode(code string) (string, error) {
	if code == "" {
		return "", errors.New("无效的参数")
	}
	if common.WeChatServerAddress == "" {
		return "", errors.New("未配置微信验证码服务")
	}
	req, err := http.NewRequest("GET", fmt.Sprintf("%s/api/wechat/user?code=%s", common.WeChatServerAddress, url.QueryEscape(code)), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", common.WeChatServerToken)
	client := http.Client{
		Timeout: 5 * time.Second,
	}
	httpResponse, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer httpResponse.Body.Close()
	var res wechatLoginResponse
	err = common.DecodeJson(httpResponse.Body, &res)
	if err != nil {
		return "", err
	}
	if !res.Success {
		return "", errors.New(res.Message)
	}
	if res.Data == "" {
		return "", errors.New("验证码错误或已过期")
	}
	return res.Data, nil
}

// WeChatAuth keeps the legacy verification-code login path.
func WeChatAuth(c *gin.Context) {
	if !common.WeChatAuthEnabled {
		c.JSON(http.StatusOK, gin.H{
			"message": "管理员未开启通过微信登录以及注册",
			"success": false,
		})
		return
	}
	if service.WeChatMPConfigured() {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "已启用微信服务号扫码登录，请使用扫码登录",
		})
		return
	}
	code := c.Query("code")
	wechatId, err := getWeChatIdByCode(code)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"message": err.Error(),
			"success": false,
		})
		return
	}
	if err := loginOrRegisterByWeChatID(c, wechatId); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
	}
}

func WeChatBind(c *gin.Context) {
	if !common.WeChatAuthEnabled {
		c.JSON(http.StatusOK, gin.H{
			"message": "管理员未开启通过微信登录以及注册",
			"success": false,
		})
		return
	}
	if service.WeChatMPConfigured() {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "已启用微信服务号扫码绑定，请使用扫码绑定",
		})
		return
	}
	var req wechatBindRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的请求",
		})
		return
	}
	wechatId, err := getWeChatIdByCode(req.Code)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"message": err.Error(),
			"success": false,
		})
		return
	}
	if err := bindWeChatIDToCurrentUser(c, wechatId); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// WeChatQRCode creates a temporary Official Account QR code for login or bind.
func WeChatQRCode(c *gin.Context) {
	if !common.WeChatAuthEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "管理员未开启通过微信登录以及注册"})
		return
	}
	if !service.WeChatMPConfigured() {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "未配置微信服务号 AppID/AppSecret/Token"})
		return
	}

	intent := strings.TrimSpace(c.Query("intent"))
	if intent == "" {
		intent = service.WeChatQRIntentLogin
	}

	create := service.WeChatQRSessionCreate{
		Intent: intent,
		TTL:    wechatQRLoginTTL,
	}
	if intent == service.WeChatQRIntentBind {
		identity, ok := middleware.GetSessionAuthIdentity(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
			return
		}
		create.BindUserID = identity.UserID
	} else if intent != service.WeChatQRIntentLogin {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的 intent"})
		return
	}

	session, err := service.CreateWeChatQRSession(create)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	ticket, qrURL, expireSeconds, err := service.CreateWeChatTempQRCode(session.Scene, wechatQRLoginTTL)
	if err != nil {
		_ = service.DeleteWeChatQRSession(session.Scene)
		common.SysError("create wechat qrcode failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "创建微信登录二维码失败"})
		return
	}

	expireAt := time.Now().Add(time.Duration(expireSeconds) * time.Second).Unix()
	if err := service.UpdateWeChatQRSessionTicket(session.Scene, ticket, qrURL, expireAt); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"scene":      session.Scene,
			"intent":     session.Intent,
			"status":     service.WeChatQRStatusPending,
			"qrcode_url": qrURL,
			"expire_at":  expireAt,
			"expires_in": expireSeconds,
		},
	})
}

// WeChatQRStatus returns the current scan-login/bind ceremony state for polling.
func WeChatQRStatus(c *gin.Context) {
	if !common.WeChatAuthEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "管理员未开启通过微信登录以及注册"})
		return
	}
	scene := strings.TrimSpace(c.Query("scene"))
	session, err := service.GetWeChatQRSession(scene)
	if err != nil {
		writeWeChatQRSessionError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"scene":     session.Scene,
			"intent":    session.Intent,
			"status":    session.Status,
			"expire_at": session.ExpireAt,
			"message":   session.Message,
		},
	})
}

// WeChatQRLogin consumes a confirmed login QR session and creates a browser login.
func WeChatQRLogin(c *gin.Context) {
	if !common.WeChatAuthEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "管理员未开启通过微信登录以及注册"})
		return
	}
	scene := strings.TrimSpace(c.Query("scene"))
	if scene == "" {
		var body struct {
			Scene string `json:"scene"`
		}
		_ = common.DecodeJson(c.Request.Body, &body)
		scene = strings.TrimSpace(body.Scene)
	}
	session, err := service.ConsumeWeChatQRSession(scene, service.WeChatQRIntentLogin)
	if err != nil {
		writeWeChatQRSessionError(c, err)
		return
	}
	if err := loginOrRegisterByWeChatID(c, session.OpenID); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
	}
}

// WeChatQRBind consumes a confirmed bind QR session and attaches openid to the current user.
func WeChatQRBind(c *gin.Context) {
	if !common.WeChatAuthEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "管理员未开启通过微信登录以及注册"})
		return
	}
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
		return
	}

	var body struct {
		Scene string `json:"scene"`
	}
	if err := common.DecodeJson(c.Request.Body, &body); err != nil {
		// also accept query for convenience
		body.Scene = c.Query("scene")
	}
	scene := strings.TrimSpace(body.Scene)
	session, err := service.GetWeChatQRSession(scene)
	if err != nil {
		writeWeChatQRSessionError(c, err)
		return
	}
	if session.Intent != service.WeChatQRIntentBind {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "二维码用途不匹配"})
		return
	}
	if session.BindUserID != 0 && session.BindUserID != identity.UserID {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "二维码与当前登录用户不匹配"})
		return
	}
	if session.Status != service.WeChatQRStatusConfirmed {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请先完成微信扫码"})
		return
	}

	consumed, err := service.ConsumeWeChatQRSession(scene, service.WeChatQRIntentBind)
	if err != nil {
		writeWeChatQRSessionError(c, err)
		return
	}
	if err := bindWeChatIDToUserID(identity.UserID, consumed.OpenID); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

// WeChatServerCallback handles Official Account server URL verification and event push.
func WeChatServerCallback(c *gin.Context) {
	signature := c.Query("signature")
	timestamp := c.Query("timestamp")
	nonce := c.Query("nonce")
	echostr := c.Query("echostr")

	if c.Request.Method == http.MethodGet {
		if service.VerifyWeChatSignature(signature, timestamp, nonce) {
			c.String(http.StatusOK, echostr)
			return
		}
		c.String(http.StatusForbidden, "invalid signature")
		return
	}

	if !service.WeChatMPConfigured() {
		c.String(http.StatusOK, "success")
		return
	}

	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		c.String(http.StatusOK, "success")
		return
	}

	msgSignature := c.Query("msg_signature")
	message, err := service.ParseWeChatCallbackXML(body, msgSignature, timestamp, nonce)
	if err != nil {
		// Plain mode still validates URL signature.
		if !service.VerifyWeChatSignature(signature, timestamp, nonce) {
			common.SysError("wechat callback parse/signature failed: " + err.Error())
			c.String(http.StatusForbidden, "invalid signature")
			return
		}
		common.SysError("wechat callback parse failed: " + err.Error())
		c.String(http.StatusOK, "success")
		return
	}
	if message.Encrypt == "" && !service.VerifyWeChatSignature(signature, timestamp, nonce) {
		c.String(http.StatusForbidden, "invalid signature")
		return
	}

	if !strings.EqualFold(strings.TrimSpace(message.MsgType), "event") {
		c.String(http.StatusOK, "success")
		return
	}

	scene := service.ExtractWeChatScene(message.Event, message.EventKey)
	if scene == "" || message.FromUserName == "" {
		c.String(http.StatusOK, "success")
		return
	}

	session, err := service.ConfirmWeChatQRSession(scene, message.FromUserName)
	if err != nil {
		// Unknown/expired scenes are ignored; WeChat only needs a success ack.
		common.SysLog("wechat qr confirm skipped: " + err.Error())
		c.String(http.StatusOK, "success")
		return
	}

	reply := "登录确认成功，请回到网页继续"
	if session.Intent == service.WeChatQRIntentBind {
		reply = "绑定确认成功，请回到网页继续"
	}
	if strings.TrimSpace(common.WeChatReplyText) != "" {
		reply = strings.TrimSpace(common.WeChatReplyText)
	}
	_ = service.MarkWeChatQRSessionMessage(scene, reply)
	c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(service.BuildWeChatTextReply(message.FromUserName, message.ToUserName, reply)))
}

func loginOrRegisterByWeChatID(c *gin.Context, wechatId string) error {
	wechatId = strings.TrimSpace(wechatId)
	if wechatId == "" {
		return errors.New("无效的微信用户")
	}
	user := model.User{
		WeChatId: wechatId,
	}
	if model.IsWeChatIdAlreadyTaken(wechatId) {
		if err := user.FillUserByWeChatId(); err != nil {
			return err
		}
		if user.Id == 0 {
			return errors.New("用户已注销")
		}
	} else {
		if !common.RegisterEnabled {
			return errors.New("管理员关闭了新用户注册")
		}
		user.Username = "wechat_" + strconv.Itoa(model.GetMaxUserId()+1)
		user.DisplayName = "WeChat User"
		user.Role = common.RoleCommonUser
		user.Status = common.UserStatusEnabled
		if err := user.Insert(0); err != nil {
			return err
		}
	}
	if user.Status != common.UserStatusEnabled {
		return errors.New("用户已被封禁")
	}
	setupLogin(&user, c)
	return nil
}

func bindWeChatIDToCurrentUser(c *gin.Context, wechatId string) error {
	id := c.GetInt("id")
	if id == 0 {
		return errors.New("未登录")
	}
	return bindWeChatIDToUserID(id, wechatId)
}

func bindWeChatIDToUserID(userID int, wechatId string) error {
	wechatId = strings.TrimSpace(wechatId)
	if userID <= 0 || wechatId == "" {
		return errors.New("无效的请求")
	}
	if model.IsWeChatIdAlreadyTaken(wechatId) {
		existing := model.User{WeChatId: wechatId}
		if err := existing.FillUserByWeChatId(); err == nil && existing.Id != 0 && existing.Id != userID {
			return errors.New("该微信账号已被绑定")
		}
		if existing.Id == userID {
			return nil
		}
		// Unscoped taken by deleted user: still block to avoid reuse surprises unless free.
		if existing.Id == 0 {
			return errors.New("该微信账号已被绑定")
		}
	}
	user := model.User{Id: userID}
	if err := user.FillUserById(); err != nil {
		return err
	}
	user.WeChatId = wechatId
	return user.Update(false)
}

func writeWeChatQRSessionError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrWeChatQRSessionNotFound),
		errors.Is(err, service.ErrWeChatQRSessionInvalid):
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "二维码无效，请刷新后重试"})
	case errors.Is(err, service.ErrWeChatQRSessionExpired):
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "二维码已过期，请刷新后重试"})
	case errors.Is(err, service.ErrWeChatQRSessionConsumed):
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "二维码已使用，请刷新后重试"})
	default:
		common.ApiError(c, err)
	}
}
