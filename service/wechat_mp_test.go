package service

import (
	"crypto/sha1"
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVerifyWeChatSignature(t *testing.T) {
	common.WeChatToken = "test-token"
	timestamp := "1710000000"
	nonce := "nonce123"
	values := []string{common.WeChatToken, timestamp, nonce}
	sort.Strings(values)
	sum := sha1.Sum([]byte(strings.Join(values, "")))
	signature := fmt.Sprintf("%x", sum)

	assert.True(t, VerifyWeChatSignature(signature, timestamp, nonce))
	assert.False(t, VerifyWeChatSignature("bad", timestamp, nonce))
	assert.False(t, VerifyWeChatSignature(signature, timestamp, "other"))
}

func TestExtractWeChatScene(t *testing.T) {
	assert.Equal(t, "wq_abc", ExtractWeChatScene("subscribe", "qrscene_wq_abc"))
	assert.Equal(t, "wq_abc", ExtractWeChatScene("SCAN", "wq_abc"))
	assert.Equal(t, "", ExtractWeChatScene("subscribe", "wq_abc"))
	assert.Equal(t, "", ExtractWeChatScene("CLICK", "wq_abc"))
}

func TestWeChatQRSessionLifecycle(t *testing.T) {
	common.RedisEnabled = false

	session, err := CreateWeChatQRSession(WeChatQRSessionCreate{Intent: WeChatQRIntentLogin})
	require.NoError(t, err)
	require.NotEmpty(t, session.Scene)
	assert.Equal(t, WeChatQRStatusPending, session.Status)

	got, err := GetWeChatQRSession(session.Scene)
	require.NoError(t, err)
	assert.Equal(t, session.Scene, got.Scene)

	confirmed, err := ConfirmWeChatQRSession(session.Scene, "openid-1")
	require.NoError(t, err)
	assert.Equal(t, WeChatQRStatusConfirmed, confirmed.Status)
	assert.Equal(t, "openid-1", confirmed.OpenID)

	// duplicate event is idempotent
	again, err := ConfirmWeChatQRSession(session.Scene, "openid-1")
	require.NoError(t, err)
	assert.Equal(t, "openid-1", again.OpenID)

	consumed, err := ConsumeWeChatQRSession(session.Scene, WeChatQRIntentLogin)
	require.NoError(t, err)
	assert.Equal(t, "openid-1", consumed.OpenID)

	_, err = GetWeChatQRSession(session.Scene)
	assert.ErrorIs(t, err, ErrWeChatQRSessionNotFound)
}

func TestBuildWeChatTextReply(t *testing.T) {
	xml := BuildWeChatTextReply("user-openid", "gh_official", "hello")
	assert.Contains(t, xml, "<ToUserName><![CDATA[user-openid]]></ToUserName>")
	assert.Contains(t, xml, "<FromUserName><![CDATA[gh_official]]></FromUserName>")
	assert.Contains(t, xml, "<Content><![CDATA[hello]]></Content>")
	assert.Contains(t, xml, "<MsgType><![CDATA[text]]></MsgType>")
}
