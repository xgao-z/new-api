package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLogOtherIntExprDialects(t *testing.T) {
	original := common.LogDatabaseType()
	t.Cleanup(func() { common.SetLogDatabaseType(original) })

	cases := []struct {
		name string
		db   common.DatabaseType
		want string
	}{
		{"sqlite", common.DatabaseTypeSQLite, "COALESCE(CAST(json_extract(CASE WHEN json_valid(other) THEN other END, '$.cache_tokens') AS INTEGER), 0)"},
		{"mysql", common.DatabaseTypeMySQL, "COALESCE(CAST(JSON_EXTRACT(other, '$.cache_tokens') AS SIGNED), 0)"},
		{"postgres", common.DatabaseTypePostgreSQL, "COALESCE((NULLIF(other, '')::jsonb ->> 'cache_tokens')::bigint, 0)"},
		{"clickhouse", common.DatabaseTypeClickHouse, "JSONExtractInt(other, 'cache_tokens')"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			common.SetLogDatabaseType(c.db)
			assert.Equal(t, c.want, logOtherIntExpr("cache_tokens"))
		})
	}
}

func TestLogBucketExprDialects(t *testing.T) {
	original := common.LogDatabaseType()
	t.Cleanup(func() { common.SetLogDatabaseType(original) })

	cases := []struct {
		name string
		db   common.DatabaseType
		want string
	}{
		{"sqlite", common.DatabaseTypeSQLite, "(created_at / 3600) * 3600"},
		{"mysql", common.DatabaseTypeMySQL, "FLOOR(created_at / 3600) * 3600"},
		{"postgres", common.DatabaseTypePostgreSQL, "(created_at / 3600) * 3600"},
		{"clickhouse", common.DatabaseTypeClickHouse, "intDiv(created_at, 3600) * 3600"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			common.SetLogDatabaseType(c.db)
			assert.Equal(t, c.want, logBucketExpr(3600))
		})
	}
}

// TestGetCacheHitStatsAggregatesByChannelAndModel seeds consume logs with
// different other-JSON cache payloads and asserts the per-channel × per-model
// grouping, hit counting, ratios, summary, trend buckets and channel names.
func TestGetCacheHitStatsAggregatesByChannelAndModel(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.Create(&Channel{Id: 1, Name: "alpha"}).Error)
	require.NoError(t, DB.Create(&Channel{Id: 2, Name: "beta"}).Error)

	const t0 = int64(1_700_000_000)
	hitOther := `{"cache_tokens": 100, "cache_write_tokens": 30}`
	missOther := `{"cache_tokens": 0}`

	seed := func(channelId int, modelName string, createdAt int64, other string, promptTokens int, logType int) {
		t.Helper()
		require.NoError(t, LOG_DB.Create(&Log{
			Type:         logType,
			ChannelId:    channelId,
			ModelName:    modelName,
			CreatedAt:    createdAt,
			PromptTokens: promptTokens,
			Other:        other,
		}).Error)
	}

	// In-range consume logs.
	seed(1, "gpt-4o", t0, hitOther, 200, LogTypeConsume)    // hit, cache write 30
	seed(1, "gpt-4o", t0+60, missOther, 150, LogTypeConsume) // miss
	seed(1, "gpt-4o", t0+3600, "", 50, LogTypeConsume)       // empty other, miss
	seed(2, "gpt-4o", t0+3660, hitOther, 400, LogTypeConsume)
	seed(2, "claude-3", t0, `{"cache_tokens": 100}`, 300, LogTypeConsume) // hit, no cache write
	seed(2, "claude-3", t0+60, missOther, 120, LogTypeConsume)
	// Out of range and wrong log type must be excluded.
	seed(1, "gpt-4o", t0+7200, hitOther, 10, LogTypeConsume)
	seed(1, "gpt-4o", t0+100, hitOther, 10, LogTypeTopup)

	stats, err := GetCacheHitStats(t0, t0+3660, 0, "")
	require.NoError(t, err)
	require.Len(t, stats.Items, 3)

	// Sorted by requests desc, then channel id, then model name.
	first := stats.Items[0]
	assert.Equal(t, 1, first.ChannelId)
	assert.Equal(t, "alpha", first.ChannelName)
	assert.Equal(t, "gpt-4o", first.ModelName)
	assert.EqualValues(t, 3, first.Requests)
	assert.EqualValues(t, 1, first.Hits)
	assert.InDelta(t, 1.0/3.0, first.HitRate, 1e-9)
	assert.EqualValues(t, 100, first.CacheTokens)
	assert.EqualValues(t, 400, first.PromptTokens)
	assert.InDelta(t, 0.25, first.TokenCacheRatio, 1e-9)
	assert.EqualValues(t, 30, first.CacheWriteTokens)

	second := stats.Items[1]
	assert.Equal(t, 2, second.ChannelId)
	assert.Equal(t, "beta", second.ChannelName)
	assert.Equal(t, "claude-3", second.ModelName)
	assert.EqualValues(t, 2, second.Requests)
	assert.EqualValues(t, 1, second.Hits)
	assert.InDelta(t, 0.5, second.HitRate, 1e-9)
	assert.EqualValues(t, 100, second.CacheTokens)
	assert.EqualValues(t, 420, second.PromptTokens)
	assert.EqualValues(t, 0, second.CacheWriteTokens)

	third := stats.Items[2]
	assert.Equal(t, 2, third.ChannelId)
	assert.Equal(t, "beta", third.ChannelName)
	assert.Equal(t, "gpt-4o", third.ModelName)
	assert.EqualValues(t, 1, third.Requests)
	assert.EqualValues(t, 1, third.Hits)
	assert.InDelta(t, 1.0, third.HitRate, 1e-9)

	assert.EqualValues(t, 6, stats.Summary.Requests)
	assert.EqualValues(t, 3, stats.Summary.Hits)
	assert.InDelta(t, 0.5, stats.Summary.HitRate, 1e-9)
	assert.EqualValues(t, 300, stats.Summary.CacheTokens)
	assert.EqualValues(t, 1220, stats.Summary.PromptTokens)
	assert.InDelta(t, 300.0/1220.0, stats.Summary.TokenCacheRatio, 1e-9)
	assert.EqualValues(t, 60, stats.Summary.CacheWriteTokens)

	// The ~1h span uses hourly buckets: t0 rows fall in one bucket, t0+3600
	// rows in the next.
	require.Len(t, stats.Trend, 2)
	assert.EqualValues(t, t0/3600*3600, stats.Trend[0].Bucket)
	assert.EqualValues(t, 4, stats.Trend[0].Requests)
	assert.EqualValues(t, 2, stats.Trend[0].Hits)
	assert.EqualValues(t, 200, stats.Trend[0].CacheTokens)
	assert.EqualValues(t, 770, stats.Trend[0].PromptTokens)
	assert.EqualValues(t, (t0+3600)/3600*3600, stats.Trend[1].Bucket)
	assert.EqualValues(t, 2, stats.Trend[1].Requests)
	assert.EqualValues(t, 1, stats.Trend[1].Hits)
	assert.EqualValues(t, 100, stats.Trend[1].CacheTokens)
	assert.EqualValues(t, 450, stats.Trend[1].PromptTokens)
}

func TestGetCacheHitStatsFilters(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.Create(&Channel{Id: 1, Name: "alpha"}).Error)
	require.NoError(t, DB.Create(&Channel{Id: 2, Name: "beta"}).Error)

	const t0 = int64(1_700_000_000)
	hitOther := `{"cache_tokens": 100, "cache_write_tokens": 30}`
	seed := func(channelId int, modelName string, createdAt int64) {
		t.Helper()
		require.NoError(t, LOG_DB.Create(&Log{
			Type:         LogTypeConsume,
			ChannelId:    channelId,
			ModelName:    modelName,
			CreatedAt:    createdAt,
			PromptTokens: 100,
			Other:        hitOther,
		}).Error)
	}
	seed(1, "gpt-4o", t0)
	seed(2, "gpt-4o", t0+1)
	seed(2, "claude-3", t0+2)

	byChannel, err := GetCacheHitStats(t0, t0+100, 2, "")
	require.NoError(t, err)
	require.Len(t, byChannel.Items, 2)
	for _, item := range byChannel.Items {
		assert.Equal(t, 2, item.ChannelId)
	}
	assert.EqualValues(t, 2, byChannel.Summary.Requests)

	byModel, err := GetCacheHitStats(t0, t0+100, 0, "gpt-4o")
	require.NoError(t, err)
	require.Len(t, byModel.Items, 2)
	for _, item := range byModel.Items {
		assert.Equal(t, "gpt-4o", item.ModelName)
	}
	assert.EqualValues(t, 2, byModel.Summary.Requests)
}

func TestGetCacheHitStatsEmptyRange(t *testing.T) {
	truncateTables(t)

	stats, err := GetCacheHitStats(1_700_000_000, 1_700_003_600, 0, "")
	require.NoError(t, err)
	assert.Empty(t, stats.Items)
	assert.Empty(t, stats.Trend)
	assert.Zero(t, stats.Summary.Requests)
	assert.Zero(t, stats.Summary.Hits)
	assert.Zero(t, stats.Summary.CacheTokens)
	assert.Zero(t, stats.Summary.HitRate)
	assert.Zero(t, stats.Summary.TokenCacheRatio)
}
