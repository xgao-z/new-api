package model

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	RechargePromotionGrantStatusActive    = "active"
	RechargePromotionGrantStatusExhausted = "exhausted"
	RechargePromotionGrantStatusExpired   = "expired"
)

// RechargePromotion defines a time-bounded recharge campaign. Tiers are kept
// separately so a campaign can offer progressively larger grants.
type RechargePromotion struct {
	Id        int                     `json:"id"`
	Name      string                  `json:"name" gorm:"type:varchar(128);not null"`
	Enabled   bool                    `json:"enabled"`
	Priority  int                     `json:"priority" gorm:"index"`
	StartTime int64                   `json:"start_time" gorm:"bigint;index"`
	EndTime   int64                   `json:"end_time" gorm:"bigint;index"`
	CreatedAt int64                   `json:"created_at" gorm:"bigint"`
	UpdatedAt int64                   `json:"updated_at" gorm:"bigint"`
	Tiers     []RechargePromotionTier `json:"tiers" gorm:"foreignKey:PromotionId;constraint:OnDelete:CASCADE"`
}

type RechargePromotionTier struct {
	Id               int     `json:"id"`
	PromotionId      int     `json:"promotion_id" gorm:"index;not null"`
	MinPaymentAmount float64 `json:"min_payment_amount"`
	ModelName        string  `json:"model_name" gorm:"type:varchar(255);index;not null"`
	GiftAmount       float64 `json:"gift_amount" gorm:"-"`
	Quota            int64   `json:"quota" gorm:"bigint;not null"`
	ExpireDays       int     `json:"expire_days"`
	CreatedAt        int64   `json:"created_at" gorm:"bigint"`
	UpdatedAt        int64   `json:"updated_at" gorm:"bigint"`
}

// RechargePromotionGrant is the durable model-scoped balance issued by a
// successful top-up. It intentionally does not contribute to User.Quota.
type RechargePromotionGrant struct {
	Id          int    `json:"id"`
	TopUpId     int    `json:"top_up_id" gorm:"uniqueIndex;not null"`
	UserId      int    `json:"user_id" gorm:"index;not null"`
	PromotionId int    `json:"promotion_id" gorm:"index"`
	TierId      int    `json:"tier_id" gorm:"index"`
	ModelName   string `json:"model_name" gorm:"type:varchar(255);index;not null"`
	TotalQuota  int64  `json:"total_quota" gorm:"bigint;not null"`
	UsedQuota   int64  `json:"used_quota" gorm:"bigint;not null;default:0"`
	Status      string `json:"status" gorm:"type:varchar(32);index;not null"`
	IssuedAt    int64  `json:"issued_at" gorm:"bigint"`
	ExpiresAt   int64  `json:"expires_at" gorm:"bigint;index"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt   int64  `json:"updated_at" gorm:"bigint;index"`
}

// RechargePromotionPreConsumeRecord gives grant reservations the same
// request-level idempotency guarantees used by subscription billing.
type RechargePromotionPreConsumeRecord struct {
	Id            int    `json:"id"`
	RequestId     string `json:"request_id" gorm:"type:varchar(96);uniqueIndex:idx_recharge_promotion_request_grant"`
	UserId        int    `json:"user_id" gorm:"index"`
	GrantId       int    `json:"grant_id" gorm:"uniqueIndex:idx_recharge_promotion_request_grant;index"`
	PreConsumed   int64  `json:"pre_consumed" gorm:"bigint;not null"`
	RefundedQuota int64  `json:"refunded_quota" gorm:"bigint;not null;default:0"`
	Status        string `json:"status" gorm:"type:varchar(32);index;not null"`
	CreatedAt     int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt     int64  `json:"updated_at" gorm:"bigint;index"`
}

type RechargePromotionConsume struct {
	GrantId     int
	RecordId    int
	ModelName   string
	PreConsumed int64
	Refunded    int64
	TotalQuota  int64
	UsedAfter   int64
	ExpiresAt   int64
}

func (p *RechargePromotion) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	p.CreatedAt = now
	p.UpdatedAt = now
	return nil
}

func (p *RechargePromotion) BeforeUpdate(tx *gorm.DB) error {
	p.UpdatedAt = common.GetTimestamp()
	return nil
}

func (t *RechargePromotionTier) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	t.CreatedAt = now
	t.UpdatedAt = now
	return nil
}

func (t *RechargePromotionTier) BeforeUpdate(tx *gorm.DB) error {
	t.UpdatedAt = common.GetTimestamp()
	return nil
}

func (g *RechargePromotionGrant) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	g.CreatedAt = now
	g.UpdatedAt = now
	return nil
}

func (g *RechargePromotionGrant) BeforeUpdate(tx *gorm.DB) error {
	g.UpdatedAt = common.GetTimestamp()
	return nil
}

func (r *RechargePromotionPreConsumeRecord) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	r.CreatedAt = now
	r.UpdatedAt = now
	return nil
}

func (r *RechargePromotionPreConsumeRecord) BeforeUpdate(tx *gorm.DB) error {
	r.UpdatedAt = common.GetTimestamp()
	return nil
}

func NormalizeRechargePromotionModelName(name string) string {
	return ratio_setting.FormatMatchingModelName(strings.TrimSpace(name))
}

func rechargePromotionQuotaFromGiftAmount(amount float64) (int64, error) {
	if !isFinitePositive(amount) {
		return 0, errors.New("gift amount must be positive")
	}
	if common.QuotaPerUnit <= 0 {
		return 0, errors.New("quota per unit must be positive")
	}

	giftAmount := decimal.NewFromFloat(amount)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		quota, clamp := common.QuotaFromDecimalChecked(giftAmount)
		if clamp != nil {
			return 0, clamp
		}
		if quota <= 0 {
			return 0, errors.New("gift amount is too small")
		}
		return int64(quota), nil
	}

	exchangeRate := operation_setting.GetUsdToCurrencyRate(operation_setting.USDExchangeRate)
	if exchangeRate <= 0 {
		return 0, errors.New("currency exchange rate must be positive")
	}
	giftAmount = giftAmount.Div(decimal.NewFromFloat(exchangeRate))
	quota, clamp := common.QuotaFromDecimalChecked(giftAmount.Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if clamp != nil {
		return 0, clamp
	}
	if quota <= 0 {
		return 0, errors.New("gift amount is too small")
	}
	return int64(quota), nil
}

func rechargePromotionGiftAmountFromQuota(quota int64) float64 {
	if quota <= 0 || common.QuotaPerUnit <= 0 {
		return 0
	}
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		return float64(quota)
	}
	giftAmount := decimal.NewFromInt(quota).Div(decimal.NewFromFloat(common.QuotaPerUnit))
	giftAmount = giftAmount.Mul(decimal.NewFromFloat(operation_setting.GetUsdToCurrencyRate(operation_setting.USDExchangeRate)))
	amount, _ := giftAmount.Round(6).Float64()
	return amount
}

func isFinitePositive(value float64) bool {
	return value > 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

func PopulateRechargePromotionGiftAmounts(promotion *RechargePromotion) {
	if promotion == nil {
		return
	}
	for index := range promotion.Tiers {
		tier := &promotion.Tiers[index]
		if tier.Quota > 0 {
			tier.GiftAmount = rechargePromotionGiftAmountFromQuota(tier.Quota)
		}
	}
}

func ValidateRechargePromotion(promotion *RechargePromotion) error {
	if promotion == nil {
		return errors.New("promotion is nil")
	}
	promotion.Name = strings.TrimSpace(promotion.Name)
	if promotion.Name == "" {
		return errors.New("promotion name is required")
	}
	if promotion.EndTime > 0 && promotion.StartTime > 0 && promotion.EndTime <= promotion.StartTime {
		return errors.New("promotion end time must be after start time")
	}
	if len(promotion.Tiers) == 0 {
		return errors.New("promotion must have at least one tier")
	}
	seenAmounts := make(map[float64]struct{}, len(promotion.Tiers))
	for index := range promotion.Tiers {
		tier := &promotion.Tiers[index]
		if tier.MinPaymentAmount <= 0 {
			return fmt.Errorf("tier %d minimum payment amount must be positive", index+1)
		}
		if _, exists := seenAmounts[tier.MinPaymentAmount]; exists {
			return fmt.Errorf("tier %d duplicates a minimum payment amount", index+1)
		}
		seenAmounts[tier.MinPaymentAmount] = struct{}{}
		tier.ModelName = NormalizeRechargePromotionModelName(tier.ModelName)
		if tier.ModelName == "" {
			return fmt.Errorf("tier %d model name is required", index+1)
		}
		if !isFinitePositive(tier.GiftAmount) {
			return fmt.Errorf("tier %d gift amount must be positive", index+1)
		}
		quota, err := rechargePromotionQuotaFromGiftAmount(tier.GiftAmount)
		if err != nil {
			return fmt.Errorf("tier %d %w", index+1, err)
		}
		tier.Quota = quota
		if tier.ExpireDays <= 0 || tier.ExpireDays > 3650 {
			return fmt.Errorf("tier %d expiry must be between 1 and 3650 days", index+1)
		}
	}
	return nil
}

func isRechargePromotionEligibleProvider(provider string) bool {
	switch provider {
	case PaymentProviderEpay, PaymentProviderStripe, PaymentProviderCreem, PaymentProviderWaffo, PaymentProviderWaffoPancake:
		return true
	default:
		return false
	}
}

func SnapshotRechargePromotionForTopUp(tx *gorm.DB, topUp *TopUp) error {
	if tx == nil || topUp == nil || !tx.Migrator().HasTable(&RechargePromotion{}) || !isRechargePromotionEligibleProvider(topUp.PaymentProvider) || topUp.Money <= 0 {
		return nil
	}
	now := common.GetTimestamp()
	var promotions []RechargePromotion
	if err := tx.Where("enabled = ? AND (start_time = 0 OR start_time <= ?) AND (end_time = 0 OR end_time > ?)", true, now, now).
		Order("priority desc, id desc").
		Find(&promotions).Error; err != nil {
		return err
	}
	for _, promotion := range promotions {
		var tier RechargePromotionTier
		result := tx.Where("promotion_id = ? AND min_payment_amount <= ?", promotion.Id, topUp.Money).
			Order("min_payment_amount desc, id desc").
			Limit(1).
			Find(&tier)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			continue
		}
		topUp.PromotionId = promotion.Id
		topUp.PromotionTierId = tier.Id
		topUp.PromotionModelName = tier.ModelName
		topUp.PromotionQuota = tier.Quota
		topUp.PromotionExpireDays = tier.ExpireDays
		return nil
	}
	return nil
}

// IssueRechargePromotionGrantTx activates the immutable promotion snapshot on
// a completed top-up. The unique top_up_id also protects multi-node callbacks.
func IssueRechargePromotionGrantTx(tx *gorm.DB, topUp *TopUp) (*RechargePromotionGrant, error) {
	if tx == nil || topUp == nil || topUp.Id <= 0 || topUp.PromotionQuota <= 0 || topUp.PromotionModelName == "" {
		return nil, nil
	}
	var existing RechargePromotionGrant
	result := tx.Where("top_up_id = ?", topUp.Id).Limit(1).Find(&existing)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected > 0 {
		return &existing, nil
	}
	expiresAt := common.GetTimestamp() + int64(topUp.PromotionExpireDays)*int64((24*time.Hour)/time.Second)
	grant := &RechargePromotionGrant{
		TopUpId:     topUp.Id,
		UserId:      topUp.UserId,
		PromotionId: topUp.PromotionId,
		TierId:      topUp.PromotionTierId,
		ModelName:   NormalizeRechargePromotionModelName(topUp.PromotionModelName),
		TotalQuota:  topUp.PromotionQuota,
		Status:      RechargePromotionGrantStatusActive,
		IssuedAt:    common.GetTimestamp(),
		ExpiresAt:   expiresAt,
	}
	if err := tx.Create(grant).Error; err != nil {
		var duplicate RechargePromotionGrant
		if err2 := tx.Where("top_up_id = ?", topUp.Id).First(&duplicate).Error; err2 == nil {
			return &duplicate, nil
		}
		return nil, err
	}
	return grant, nil
}

type RechargePromotionPreview struct {
	Id       int                     `json:"id"`
	Name     string                  `json:"name"`
	Priority int                     `json:"priority"`
	EndTime  int64                   `json:"end_time"`
	Tiers    []RechargePromotionTier `json:"tiers"`
}

func GetRechargePromotionPreviews() ([]RechargePromotionPreview, error) {
	if !DB.Migrator().HasTable(&RechargePromotion{}) {
		return []RechargePromotionPreview{}, nil
	}
	return getRechargePromotionPreviews(DB)
}

func getRechargePromotionPreviews(db *gorm.DB) ([]RechargePromotionPreview, error) {
	now := common.GetTimestamp()
	var promotions []RechargePromotion
	if err := db.Preload("Tiers", func(db *gorm.DB) *gorm.DB {
		return db.Order("min_payment_amount asc, id asc")
	}).
		Where("enabled = ? AND (start_time = 0 OR start_time <= ?) AND (end_time = 0 OR end_time > ?)", true, now, now).
		Order("priority desc, id desc").Find(&promotions).Error; err != nil {
		return nil, err
	}
	previews := make([]RechargePromotionPreview, 0, len(promotions))
	for _, promotion := range promotions {
		for index := range promotion.Tiers {
			promotion.Tiers[index].GiftAmount = rechargePromotionGiftAmountFromQuota(promotion.Tiers[index].Quota)
		}
		previews = append(previews, RechargePromotionPreview{
			Id:       promotion.Id,
			Name:     promotion.Name,
			Priority: promotion.Priority,
			EndTime:  promotion.EndTime,
			Tiers:    promotion.Tiers,
		})
	}
	return previews, nil
}

func GetUserRechargePromotionGrants(userId int, includeInactive bool) ([]RechargePromotionGrant, error) {
	query := DB.Where("user_id = ?", userId).Order("expires_at asc, id asc")
	if !includeInactive {
		now := common.GetTimestamp()
		query = query.Where("status = ? AND expires_at > ? AND used_quota < total_quota", RechargePromotionGrantStatusActive, now)
	}
	var grants []RechargePromotionGrant
	if err := query.Find(&grants).Error; err != nil {
		return nil, err
	}
	return grants, nil
}

// PreConsumeRechargePromotion reserves promotion quota up to amount for a request.
// amount is a target total, so retries are idempotent and later settlement can
// increase the reservation without duplicating existing request records.
func PreConsumeRechargePromotion(requestId string, userId int, modelName string, amount int64) ([]RechargePromotionConsume, int64, error) {
	if userId <= 0 || amount < 0 || strings.TrimSpace(requestId) == "" {
		return nil, amount, errors.New("invalid recharge promotion pre-consume parameters")
	}
	if amount == 0 {
		return nil, 0, nil
	}
	modelName = NormalizeRechargePromotionModelName(modelName)
	if modelName == "" {
		return nil, amount, nil
	}

	now := common.GetTimestamp()
	var consumes []RechargePromotionConsume
	remaining := amount
	err := DB.Transaction(func(tx *gorm.DB) error {
		var records []RechargePromotionPreConsumeRecord
		if err := lockForUpdate(tx).Where("request_id = ?", requestId).Order("id asc").Find(&records).Error; err != nil {
			return err
		}

		recordIndexByGrant := make(map[int]int, len(records))
		for index := range records {
			record := &records[index]
			if record.UserId != userId {
				return fmt.Errorf("recharge promotion request %q belongs to another user", requestId)
			}
			var grant RechargePromotionGrant
			if err := lockForUpdate(tx).Where("id = ?", record.GrantId).First(&grant).Error; err != nil {
				return err
			}
			if grant.UserId != userId || grant.ModelName != modelName {
				return fmt.Errorf("recharge promotion request %q does not match the requested model", requestId)
			}
			if reserved := record.PreConsumed - record.RefundedQuota; reserved > 0 {
				remaining -= reserved
			}
			recordIndexByGrant[record.GrantId] = index
		}
		if remaining < 0 {
			remaining = 0
		}

		if remaining > 0 {
			var grants []RechargePromotionGrant
			if err := lockForUpdate(tx).
				Where("user_id = ? AND model_name = ? AND status = ? AND expires_at > ? AND used_quota < total_quota", userId, modelName, RechargePromotionGrantStatusActive, now).
				Order("expires_at asc, id asc").
				Find(&grants).Error; err != nil {
				return err
			}
			for index := range grants {
				if remaining == 0 {
					break
				}
				grant := &grants[index]
				available := grant.TotalQuota - grant.UsedQuota
				if available <= 0 {
					continue
				}
				consume := available
				if consume > remaining {
					consume = remaining
				}

				if recordIndex, exists := recordIndexByGrant[grant.Id]; exists {
					record := &records[recordIndex]
					record.PreConsumed += consume
					record.Status = "consumed"
					if err := tx.Save(record).Error; err != nil {
						return err
					}
				} else {
					record := RechargePromotionPreConsumeRecord{
						RequestId:   requestId,
						UserId:      userId,
						GrantId:     grant.Id,
						PreConsumed: consume,
						Status:      "consumed",
					}
					if err := tx.Create(&record).Error; err != nil {
						return err
					}
					recordIndexByGrant[grant.Id] = len(records)
					records = append(records, record)
				}

				grant.UsedQuota += consume
				if grant.UsedQuota >= grant.TotalQuota {
					grant.Status = RechargePromotionGrantStatusExhausted
				}
				if err := tx.Save(grant).Error; err != nil {
					return err
				}
				remaining -= consume
			}
		}

		for _, record := range records {
			var grant RechargePromotionGrant
			if err := tx.Where("id = ?", record.GrantId).First(&grant).Error; err != nil {
				return err
			}
			consumes = append(consumes, RechargePromotionConsume{
				GrantId:     grant.Id,
				RecordId:    record.Id,
				ModelName:   grant.ModelName,
				PreConsumed: record.PreConsumed,
				Refunded:    record.RefundedQuota,
				TotalQuota:  grant.TotalQuota,
				UsedAfter:   grant.UsedQuota,
				ExpiresAt:   grant.ExpiresAt,
			})
		}
		return nil
	})
	if err != nil {
		return nil, amount, err
	}
	return consumes, remaining, nil
}

func RefundRechargePromotionPreConsume(requestId string, amount int64) error {
	if strings.TrimSpace(requestId) == "" || amount <= 0 {
		return nil
	}
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		var records []RechargePromotionPreConsumeRecord
		if err := lockForUpdate(tx).Where("request_id = ?", requestId).Order("id desc").Find(&records).Error; err != nil {
			return err
		}
		remaining := amount
		for index := range records {
			if remaining == 0 {
				break
			}
			record := &records[index]
			available := record.PreConsumed - record.RefundedQuota
			if available <= 0 {
				continue
			}
			refund := available
			if refund > remaining {
				refund = remaining
			}
			var grant RechargePromotionGrant
			if err := lockForUpdate(tx).Where("id = ?", record.GrantId).First(&grant).Error; err != nil {
				return err
			}
			if grant.UsedQuota < refund {
				return fmt.Errorf("recharge promotion grant %d has inconsistent used quota", grant.Id)
			}
			grant.UsedQuota -= refund
			if grant.ExpiresAt <= now {
				grant.Status = RechargePromotionGrantStatusExpired
			} else {
				grant.Status = RechargePromotionGrantStatusActive
			}
			record.RefundedQuota += refund
			if record.RefundedQuota >= record.PreConsumed {
				record.Status = "refunded"
			}
			if err := tx.Save(&grant).Error; err != nil {
				return err
			}
			if err := tx.Save(record).Error; err != nil {
				return err
			}
			remaining -= refund
		}
		if remaining > 0 {
			return fmt.Errorf("recharge promotion refund exceeds reserved quota by %d", remaining)
		}
		return nil
	})
}

func ExpireRechargePromotionGrants(limit int) (int, error) {
	if limit <= 0 {
		limit = 200
	}
	now := common.GetTimestamp()
	var grants []RechargePromotionGrant
	if err := DB.Where("status IN ? AND expires_at <= ?", []string{RechargePromotionGrantStatusActive, RechargePromotionGrantStatusExhausted}, now).
		Order("expires_at asc").Limit(limit).Find(&grants).Error; err != nil {
		return 0, err
	}
	count := 0
	for _, grant := range grants {
		result := DB.Model(&RechargePromotionGrant{}).
			Where("id = ? AND status IN ? AND expires_at <= ?", grant.Id, []string{RechargePromotionGrantStatusActive, RechargePromotionGrantStatusExhausted}, now).
			Update("status", RechargePromotionGrantStatusExpired)
		if result.Error != nil {
			return count, result.Error
		}
		count += int(result.RowsAffected)
	}
	return count, nil
}

func CleanupRechargePromotionPreConsumeRecords(olderThanSeconds int64) (int64, error) {
	if olderThanSeconds <= 0 {
		olderThanSeconds = 7 * 24 * 3600
	}
	result := DB.Where("updated_at < ?", common.GetTimestamp()-olderThanSeconds).Delete(&RechargePromotionPreConsumeRecord{})
	return result.RowsAffected, result.Error
}
