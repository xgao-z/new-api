package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type TopUp struct {
	Id              int     `json:"id"`
	UserId          int     `json:"user_id" gorm:"index"`
	Amount          int64   `json:"amount"`
	Money           float64 `json:"money"`
	TradeNo         string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod   string  `json:"payment_method" gorm:"type:varchar(50)"`
	PaymentProvider string  `json:"payment_provider" gorm:"type:varchar(50);default:''"`
	CreateTime      int64   `json:"create_time"`
	CompleteTime    int64   `json:"complete_time"`
	Status          string  `json:"status"`
	// Promotion fields are frozen at order creation. Payment callbacks must not
	// consult mutable campaign configuration when granting benefits.
	PromotionId         int    `json:"promotion_id" gorm:"index"`
	PromotionTierId     int    `json:"promotion_tier_id" gorm:"index"`
	PromotionModelName  string `json:"promotion_model_name" gorm:"type:varchar(255)"`
	PromotionQuota      int64  `json:"promotion_quota" gorm:"bigint"`
	PromotionExpireDays int    `json:"promotion_expire_days"`
}

func (topUp *TopUp) BeforeCreate(tx *gorm.DB) error {
	return SnapshotRechargePromotionForTopUp(tx, topUp)
}

const (
	PaymentMethodStripe       = "stripe"
	PaymentMethodCreem        = "creem"
	PaymentMethodWaffo        = "waffo"
	PaymentMethodWaffoPancake = "waffo_pancake"
	PaymentMethodBalance      = "balance"
)

const (
	PaymentProviderEpay         = "epay"
	PaymentProviderStripe       = "stripe"
	PaymentProviderCreem        = "creem"
	PaymentProviderWaffo        = "waffo"
	PaymentProviderWaffoPancake = "waffo_pancake"
	PaymentProviderBalance      = "balance"
)

var (
	ErrPaymentMethodMismatch = errors.New("payment method mismatch")
	ErrTopUpNotFound         = errors.New("topup not found")
	ErrTopUpStatusInvalid    = errors.New("topup status invalid")
)

type TopUpCompleteOptions struct {
	ExpectedPaymentProvider string
	PaymentMethod           string
	StripeCustomer          string
	CustomerEmail           string
	QuotaCalculator         func(*TopUp) (int, error)
}

type TopUpCompleteResult struct {
	TopUp            TopUp
	QuotaAdded       int
	PromotionGrant   *RechargePromotionGrant
	AlreadyCompleted bool
}

func quotaFromTopUpDecimal(value decimal.Decimal) (int, error) {
	quota, clamp := common.QuotaFromDecimalChecked(value)
	if clamp != nil {
		return 0, clamp
	}
	if quota <= 0 {
		return 0, errors.New("invalid top-up quota")
	}
	return quota, nil
}

// CompleteTopUp is the only payment-completion transaction for regular top-ups.
// It commits the order, wallet quota, and any frozen promotion grant together.
func CompleteTopUp(tradeNo string, options TopUpCompleteOptions) (*TopUpCompleteResult, error) {
	if tradeNo == "" || options.QuotaCalculator == nil {
		return nil, errors.New("invalid top-up completion parameters")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}
	result := &TopUpCompleteResult{}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var topUp TopUp
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(&topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if options.ExpectedPaymentProvider != "" && topUp.PaymentProvider != options.ExpectedPaymentProvider {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status == common.TopUpStatusSuccess {
			result.TopUp = topUp
			result.AlreadyCompleted = true
			return nil
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}

		quotaToAdd, err := options.QuotaCalculator(&topUp)
		if err != nil {
			return err
		}
		if options.PaymentMethod != "" {
			topUp.PaymentMethod = options.PaymentMethod
		}
		topUp.Status = common.TopUpStatusSuccess
		topUp.CompleteTime = common.GetTimestamp()
		if err := tx.Save(&topUp).Error; err != nil {
			return err
		}

		updates := map[string]interface{}{
			"quota": gorm.Expr("quota + ?", quotaToAdd),
		}
		if options.StripeCustomer != "" {
			updates["stripe_customer"] = options.StripeCustomer
		}
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(updates).Error; err != nil {
			return err
		}
		if options.CustomerEmail != "" {
			if err := tx.Model(&User{}).Where("id = ? AND email = ?", topUp.UserId, "").Update("email", options.CustomerEmail).Error; err != nil {
				return err
			}
		}
		grant, err := IssueRechargePromotionGrantTx(tx, &topUp)
		if err != nil {
			return err
		}
		result.TopUp = topUp
		result.QuotaAdded = quotaToAdd
		result.PromotionGrant = grant
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (topUp *TopUp) Insert() error {
	var err error
	err = DB.Create(topUp).Error
	return err
}

func (topUp *TopUp) Update() error {
	var err error
	err = DB.Save(topUp).Error
	return err
}

func GetTopUpById(id int) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("id = ?", id).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func UpdatePendingTopUpStatus(tradeNo string, expectedPaymentProvider string, targetStatus string) error {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if expectedPaymentProvider != "" && topUp.PaymentProvider != expectedPaymentProvider {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}

		topUp.Status = targetStatus
		return tx.Save(topUp).Error
	})
}

func Recharge(referenceId string, customerId string, callerIp string) error {
	result, err := CompleteTopUp(referenceId, TopUpCompleteOptions{
		ExpectedPaymentProvider: PaymentProviderStripe,
		StripeCustomer:          customerId,
		QuotaCalculator: func(topUp *TopUp) (int, error) {
			return quotaFromTopUpDecimal(decimal.NewFromFloat(topUp.Money).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
		},
	})
	if err != nil {
		common.SysError("topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if result.AlreadyCompleted {
		return nil
	}
	RecordTopupLog(result.TopUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%d", logger.FormatQuota(result.QuotaAdded), result.TopUp.Amount), callerIp, result.TopUp.PaymentMethod, PaymentMethodStripe)
	return nil
}

// topUpQueryWindowSeconds 限制充值记录查询的时间窗口（秒）。
const topUpQueryWindowSeconds int64 = 30 * 24 * 60 * 60

// topUpQueryCutoff 返回允许查询的最早 create_time（秒级 Unix 时间戳）。
func topUpQueryCutoff() int64 {
	return common.GetTimestamp() - topUpQueryWindowSeconds
}

func GetUserTopUps(userId int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	// Start transaction
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	cutoff := topUpQueryCutoff()

	// Get total count within transaction
	err = tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, cutoff).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated topups within same transaction
	err = tx.Where("user_id = ? AND create_time >= ?", userId, cutoff).Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUps 获取全平台的充值记录（管理员使用，不限制时间窗口）
func GetAllTopUps(pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&TopUp{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// searchTopUpCountHardLimit 搜索充值记录时 COUNT 的安全上限，
// 防止对超大表执行无界 COUNT 触发 DoS。
const searchTopUpCountHardLimit = 10000

// SearchUserTopUps 按订单号搜索某用户的充值记录
func SearchUserTopUps(userId int, keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, topUpQueryCutoff())
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// SearchAllTopUps 按订单号搜索全平台充值记录（管理员使用，不限制时间窗口）
func SearchAllTopUps(keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{})
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

func ManualCompleteTopUp(tradeNo string, callerIp string) error {
	result, err := CompleteTopUp(tradeNo, TopUpCompleteOptions{
		QuotaCalculator: func(topUp *TopUp) (int, error) {
			amount := decimal.NewFromInt(topUp.Amount)
			if topUp.PaymentProvider == PaymentProviderStripe {
				amount = decimal.NewFromFloat(topUp.Money)
			}
			return quotaFromTopUpDecimal(amount.Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
		},
	})
	if err != nil {
		return err
	}
	if result.AlreadyCompleted {
		return nil
	}
	RecordTopupLog(result.TopUp.UserId, fmt.Sprintf("管理员补单成功，充值金额: %v，支付金额：%f", logger.FormatQuota(result.QuotaAdded), result.TopUp.Money), callerIp, result.TopUp.PaymentMethod, "admin")
	return nil
}
func RechargeCreem(referenceId string, customerEmail string, customerName string, callerIp string) error {
	result, err := CompleteTopUp(referenceId, TopUpCompleteOptions{
		ExpectedPaymentProvider: PaymentProviderCreem,
		CustomerEmail:           customerEmail,
		QuotaCalculator: func(topUp *TopUp) (int, error) {
			return quotaFromTopUpDecimal(decimal.NewFromInt(topUp.Amount))
		},
	})
	if err != nil {
		common.SysError("creem topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if result.AlreadyCompleted {
		return nil
	}
	RecordTopupLog(result.TopUp.UserId, fmt.Sprintf("使用Creem充值成功，充值额度: %v，支付金额：%.2f", result.QuotaAdded, result.TopUp.Money), callerIp, result.TopUp.PaymentMethod, PaymentMethodCreem)
	return nil
}

func RechargeWaffo(tradeNo string, callerIp string) error {
	result, err := CompleteTopUp(tradeNo, TopUpCompleteOptions{
		ExpectedPaymentProvider: PaymentProviderWaffo,
		QuotaCalculator: func(topUp *TopUp) (int, error) {
			return quotaFromTopUpDecimal(decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
		},
	})
	if err != nil {
		common.SysError("waffo topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if result.AlreadyCompleted {
		return nil
	}
	RecordTopupLog(result.TopUp.UserId, fmt.Sprintf("Waffo充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(result.QuotaAdded), result.TopUp.Money), callerIp, result.TopUp.PaymentMethod, PaymentMethodWaffo)
	return nil
}

func RechargeWaffoPancake(tradeNo string) error {
	result, err := CompleteTopUp(tradeNo, TopUpCompleteOptions{
		ExpectedPaymentProvider: PaymentProviderWaffoPancake,
		QuotaCalculator: func(topUp *TopUp) (int, error) {
			return quotaFromTopUpDecimal(decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
		},
	})
	if err != nil {
		common.SysError("waffo pancake topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if result.AlreadyCompleted {
		return nil
	}
	RecordLog(result.TopUp.UserId, LogTypeTopup, fmt.Sprintf("Waffo Pancake充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(result.QuotaAdded), result.TopUp.Money))
	return nil
}
