package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRechargePromotionFixture(t *testing.T) (*User, *RechargePromotion) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(
		&User{},
		&TopUp{},
		&RechargePromotion{},
		&RechargePromotionTier{},
		&RechargePromotionGrant{},
		&RechargePromotionPreConsumeRecord{},
	))
	for _, value := range []interface{}{
		&RechargePromotionPreConsumeRecord{},
		&RechargePromotionGrant{},
		&RechargePromotionTier{},
		&RechargePromotion{},
		&TopUp{},
		&User{},
	} {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(value).Error)
	}
	t.Cleanup(func() {
		for _, value := range []interface{}{
			&RechargePromotionPreConsumeRecord{},
			&RechargePromotionGrant{},
			&RechargePromotionTier{},
			&RechargePromotion{},
			&TopUp{},
			&User{},
		} {
			require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(value).Error)
		}
	})

	user := &User{Username: "promotion-user", Password: "password", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(user).Error)
	promotion := &RechargePromotion{
		Name:     "GPT promotion",
		Enabled:  true,
		Priority: 10,
		Tiers: []RechargePromotionTier{
			{MinPaymentAmount: 10, ModelName: "gpt-4o", GiftAmount: 300, ExpireDays: 30},
			{MinPaymentAmount: 20, ModelName: "gpt-4o", GiftAmount: 800, ExpireDays: 30},
		},
	}
	require.NoError(t, ValidateRechargePromotion(promotion))
	require.NoError(t, DB.Create(promotion).Error)
	return user, promotion
}

func TestRechargePromotionConvertsGiftAmountToQuota(t *testing.T) {
	originalQuotaPerUnit := common.QuotaPerUnit
	originalDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	originalExchangeRate := operation_setting.USDExchangeRate
	t.Cleanup(func() {
		common.QuotaPerUnit = originalQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = originalDisplayType
		operation_setting.USDExchangeRate = originalExchangeRate
	})
	common.QuotaPerUnit = 500000

	t.Run("USD", func(t *testing.T) {
		operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
		promotion := &RechargePromotion{
			Name: "USD promotion",
			Tiers: []RechargePromotionTier{{
				MinPaymentAmount: 1,
				ModelName:        "gpt-4o",
				GiftAmount:       100,
				ExpireDays:       30,
			}},
		}
		require.NoError(t, ValidateRechargePromotion(promotion))
		assert.Equal(t, int64(50000000), promotion.Tiers[0].Quota)
	})

	t.Run("CNY", func(t *testing.T) {
		operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
		operation_setting.USDExchangeRate = 7.25
		promotion := &RechargePromotion{
			Name: "CNY promotion",
			Tiers: []RechargePromotionTier{{
				MinPaymentAmount: 1,
				ModelName:        "gpt-4o",
				GiftAmount:       72.5,
				ExpireDays:       30,
			}},
		}
		require.NoError(t, ValidateRechargePromotion(promotion))
		assert.Equal(t, int64(5000000), promotion.Tiers[0].Quota)
	})

	t.Run("tokens", func(t *testing.T) {
		operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
		promotion := &RechargePromotion{
			Name: "Token promotion",
			Tiers: []RechargePromotionTier{{
				MinPaymentAmount: 1,
				ModelName:        "gpt-4o",
				GiftAmount:       100,
				ExpireDays:       30,
			}},
		}
		require.NoError(t, ValidateRechargePromotion(promotion))
		assert.Equal(t, int64(100), promotion.Tiers[0].Quota)
	})
}

func TestRechargePromotionRejectsGiftAmountThatOverflowsQuota(t *testing.T) {
	originalQuotaPerUnit := common.QuotaPerUnit
	originalDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	t.Cleanup(func() {
		common.QuotaPerUnit = originalQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = originalDisplayType
	})
	common.QuotaPerUnit = 500000
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD

	promotion := &RechargePromotion{
		Name: "Oversized promotion",
		Tiers: []RechargePromotionTier{{
			MinPaymentAmount: 1,
			ModelName:        "gpt-4o",
			GiftAmount:       100000,
			ExpireDays:       30,
		}},
	}
	assert.ErrorContains(t, ValidateRechargePromotion(promotion), "quota conversion")
}

func TestRechargePromotionDerivesGiftAmountForLegacyTier(t *testing.T) {
	originalQuotaPerUnit := common.QuotaPerUnit
	originalDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	t.Cleanup(func() {
		common.QuotaPerUnit = originalQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = originalDisplayType
	})
	common.QuotaPerUnit = 500000
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD

	promotion := &RechargePromotion{
		Name: "Legacy promotion",
		Tiers: []RechargePromotionTier{{
			MinPaymentAmount: 1,
			ModelName:        "gpt-4o",
			Quota:            2500000,
			ExpireDays:       30,
		}},
	}
	PopulateRechargePromotionGiftAmounts(promotion)
	assert.Equal(t, 5.0, promotion.Tiers[0].GiftAmount)
	assert.Equal(t, int64(2500000), promotion.Tiers[0].Quota)
}

func TestRechargePromotionNormalizesConfiguredModelNames(t *testing.T) {
	assert.Equal(t, "gpt-4o-gizmo-*", NormalizeRechargePromotionModelName("gpt-4o-gizmo-123"))
	assert.Equal(t, "gemini-2.5-pro-thinking-*", NormalizeRechargePromotionModelName("gemini-2.5-pro-thinking-4096"))
}

func TestRechargePromotionSnapshotsHighestTierAndIssuesGrant(t *testing.T) {
	user, promotion := setupRechargePromotionFixture(t)
	order := &TopUp{
		UserId:          user.Id,
		Amount:          25,
		Money:           25,
		TradeNo:         "promotion-order-1",
		PaymentMethod:   "test",
		PaymentProvider: PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(order).Error)
	require.Equal(t, promotion.Id, order.PromotionId)
	require.Equal(t, promotion.Tiers[1].Quota, order.PromotionQuota)
	require.Equal(t, "gpt-4o", order.PromotionModelName)

	result, err := CompleteTopUp(order.TradeNo, TopUpCompleteOptions{
		ExpectedPaymentProvider: PaymentProviderEpay,
		QuotaCalculator: func(*TopUp) (int, error) {
			return 1000, nil
		},
	})
	require.NoError(t, err)
	require.False(t, result.AlreadyCompleted)
	require.NotNil(t, result.PromotionGrant)
	assert.Equal(t, order.PromotionQuota, result.PromotionGrant.TotalQuota)

	second, err := CompleteTopUp(order.TradeNo, TopUpCompleteOptions{
		ExpectedPaymentProvider: PaymentProviderEpay,
		QuotaCalculator: func(*TopUp) (int, error) {
			return 1000, nil
		},
	})
	require.NoError(t, err)
	assert.True(t, second.AlreadyCompleted)

	var grants []RechargePromotionGrant
	require.NoError(t, DB.Where("top_up_id = ?", order.Id).Find(&grants).Error)
	assert.Len(t, grants, 1)

	var savedUser User
	require.NoError(t, DB.First(&savedUser, user.Id).Error)
	assert.Equal(t, 1000, savedUser.Quota)
}

func TestRechargePromotionConsumesSoonestExpiringGrantThenRefunds(t *testing.T) {
	user, _ := setupRechargePromotionFixture(t)
	now := common.GetTimestamp()
	grants := []RechargePromotionGrant{
		{TopUpId: 1, UserId: user.Id, ModelName: "gpt-4o", TotalQuota: 100, Status: RechargePromotionGrantStatusActive, IssuedAt: now, ExpiresAt: now + 2*86400},
		{TopUpId: 2, UserId: user.Id, ModelName: "gpt-4o", TotalQuota: 200, Status: RechargePromotionGrantStatusActive, IssuedAt: now, ExpiresAt: now + 3*86400},
	}
	require.NoError(t, DB.Create(&grants).Error)

	consumes, remaining, err := PreConsumeRechargePromotion("promotion-request-1", user.Id, "gpt-4o", 150)
	require.NoError(t, err)
	assert.Equal(t, int64(0), remaining)
	require.Len(t, consumes, 2)
	assert.Equal(t, int64(100), consumes[0].PreConsumed)
	assert.Equal(t, int64(50), consumes[1].PreConsumed)

	require.NoError(t, RefundRechargePromotionPreConsume("promotion-request-1", 40))
	var first RechargePromotionGrant
	var second RechargePromotionGrant
	require.NoError(t, DB.First(&first, grants[0].Id).Error)
	require.NoError(t, DB.First(&second, grants[1].Id).Error)
	assert.Equal(t, int64(100), first.UsedQuota)
	assert.Equal(t, RechargePromotionGrantStatusExhausted, first.Status)
	assert.Equal(t, int64(10), second.UsedQuota)

	consumes, remaining, err = PreConsumeRechargePromotion("promotion-request-1", user.Id, "gpt-4o", 220)
	require.NoError(t, err)
	assert.Equal(t, int64(0), remaining)
	require.Len(t, consumes, 2)
	assert.Equal(t, int64(100), consumes[0].PreConsumed)
	assert.Equal(t, int64(160), consumes[1].PreConsumed)

	var expandedFirst RechargePromotionGrant
	var expandedSecond RechargePromotionGrant
	require.NoError(t, DB.First(&expandedFirst, grants[0].Id).Error)
	require.NoError(t, DB.First(&expandedSecond, grants[1].Id).Error)
	assert.Equal(t, int64(100), expandedFirst.UsedQuota)
	assert.Equal(t, int64(120), expandedSecond.UsedQuota)

	_, remaining, err = PreConsumeRechargePromotion("promotion-request-2", user.Id, "gpt-4o", 250)
	require.NoError(t, err)
	assert.Equal(t, int64(170), remaining)
}

func TestRechargePromotionExpiredGrantCannotBeConsumed(t *testing.T) {
	user, _ := setupRechargePromotionFixture(t)
	expired := &RechargePromotionGrant{
		TopUpId:    3,
		UserId:     user.Id,
		ModelName:  "gpt-4o",
		TotalQuota: 100,
		Status:     RechargePromotionGrantStatusActive,
		IssuedAt:   common.GetTimestamp() - 2*86400,
		ExpiresAt:  common.GetTimestamp() - int64(time.Hour/time.Second),
	}
	require.NoError(t, DB.Create(expired).Error)

	consumes, remaining, err := PreConsumeRechargePromotion("promotion-request-expired", user.Id, "gpt-4o", 50)
	require.NoError(t, err)
	assert.Empty(t, consumes)
	assert.Equal(t, int64(50), remaining)
}
