package model

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAttachUserAgentAdminInfo verifies the consume/error log User-Agent is
// nested under other.admin_info (so formatUserLogs strips it for non-admin
// views), existing admin_info entries survive, and oversized headers are
// bounded before hitting the log's other column.
func TestAttachUserAgentAdminInfo(t *testing.T) {
	newCtx := func(ua string) *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
		if ua != "" {
			c.Request.Header.Set("User-Agent", ua)
		}
		return c
	}

	t.Run("creates admin_info on nil other", func(t *testing.T) {
		other := attachUserAgentAdminInfo(newCtx("curl/8.4.0"), nil)
		require.NotNil(t, other)
		adminInfo, ok := other["admin_info"].(map[string]interface{})
		require.True(t, ok)
		assert.Equal(t, "curl/8.4.0", adminInfo["user_agent"])
	})

	t.Run("preserves existing admin_info entries", func(t *testing.T) {
		other := map[string]interface{}{
			"model_price": 0.004,
			"admin_info":  map[string]interface{}{"use_channel": []string{"1"}},
		}
		got := attachUserAgentAdminInfo(newCtx("OpenAI/Python 1.30.1"), other)
		adminInfo, ok := got["admin_info"].(map[string]interface{})
		require.True(t, ok)
		assert.Equal(t, "OpenAI/Python 1.30.1", adminInfo["user_agent"])
		assert.Equal(t, []string{"1"}, adminInfo["use_channel"])
		assert.Equal(t, 0.004, got["model_price"])
	})

	t.Run("empty UA leaves other untouched", func(t *testing.T) {
		assert.Nil(t, attachUserAgentAdminInfo(newCtx(""), nil))
		other := map[string]interface{}{"model_price": 0.004}
		got := attachUserAgentAdminInfo(newCtx(""), other)
		_, hasAdminInfo := got["admin_info"]
		assert.False(t, hasAdminInfo)
	})

	t.Run("oversized UA is truncated to the bound", func(t *testing.T) {
		got := attachUserAgentAdminInfo(newCtx(strings.Repeat("a", 4096)), nil)
		adminInfo, ok := got["admin_info"].(map[string]interface{})
		require.True(t, ok)
		ua, ok := adminInfo["user_agent"].(string)
		require.True(t, ok)
		assert.Len(t, ua, maxLogUserAgentLength)
	})

	t.Run("nil request context is a no-op", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		assert.Nil(t, attachUserAgentAdminInfo(c, nil))
		assert.Nil(t, attachUserAgentAdminInfo(nil, nil))
	})
}
