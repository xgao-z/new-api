package service

import (
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

// BillingSession encapsulates a request's pre-consume, settlement, and refund
// lifecycle. Promotion quota is always allocated before the selected fallback
// funding source, while the token quota reserves the entire request total.
type BillingSession struct {
	relayInfo        *relaycommon.RelayInfo
	funding          FundingSource
	promotion        *RechargePromotionFunding
	preConsumedQuota int
	tokenConsumed    int

	promotionPreConsumed int
	fallbackPreConsumed  int
	extraReserved        int
	trusted              bool
	fundingSettled       bool
	settled              bool
	refunded             bool
	mu                   sync.Mutex
}

// Settle allocates final usage to promotion quota first, then adjusts the
// fallback balance and token quota by their respective deltas.
func (s *BillingSession) Settle(actualQuota int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settled {
		return nil
	}
	if actualQuota < 0 {
		return fmt.Errorf("actual quota cannot be negative: %d", actualQuota)
	}

	promotionBefore := s.promotionConsumed()
	if s.promotion != nil && actualQuota > promotionBefore {
		if _, err := s.promotion.ReserveTarget(actualQuota); err != nil {
			return err
		}
	}

	promotionTarget := s.promotionConsumed()
	if promotionTarget > actualQuota {
		promotionTarget = actualQuota
	}
	fallbackTarget := actualQuota - promotionTarget
	fallbackDelta := fallbackTarget - s.fallbackPreConsumed
	createdSubscriptionReservation := false
	if fallbackDelta != 0 {
		if sub, ok := s.funding.(*SubscriptionFunding); ok && sub.subscriptionId == 0 && fallbackDelta > 0 {
			if err := s.reserveFallback(fallbackDelta); err != nil {
				if s.promotion != nil && s.promotionConsumed() > promotionBefore {
					if rollbackErr := s.promotion.RefundTo(promotionBefore); rollbackErr != nil {
						common.SysLog("error rolling back promotion settlement reserve: " + rollbackErr.Error())
					}
				}
				return err
			}
			createdSubscriptionReservation = true
		} else if err := s.settleFallback(fallbackDelta); err != nil {
			if s.promotion != nil && s.promotionConsumed() > promotionBefore {
				if rollbackErr := s.promotion.RefundTo(promotionBefore); rollbackErr != nil {
					common.SysLog("error rolling back promotion settlement reserve: " + rollbackErr.Error())
				}
			}
			return err
		}
		s.fallbackPreConsumed = fallbackTarget
		if sub, ok := s.funding.(*SubscriptionFunding); ok && sub.subscriptionId > 0 && !createdSubscriptionReservation {
			s.relayInfo.SubscriptionPostDelta += int64(fallbackDelta)
		}
	}

	if s.promotion != nil && promotionTarget < s.promotionConsumed() {
		// The fallback has already committed. Do not retry its settlement if the
		// independent promotion refund fails.
		s.fundingSettled = true
		if err := s.promotion.RefundTo(promotionTarget); err != nil {
			return err
		}
	}
	s.promotionPreConsumed = s.promotionConsumed()
	s.fundingSettled = true

	quotaDelta := actualQuota - s.preConsumedQuota
	var tokenErr error
	if !s.relayInfo.IsPlayground && quotaDelta != 0 {
		if quotaDelta > 0 {
			tokenErr = model.DecreaseTokenQuota(s.relayInfo.TokenId, s.relayInfo.TokenKey, quotaDelta)
		} else {
			tokenErr = model.IncreaseTokenQuota(s.relayInfo.TokenId, s.relayInfo.TokenKey, -quotaDelta)
		}
		if tokenErr != nil {
			common.SysLog(fmt.Sprintf("error adjusting token quota after funding settled (userId=%d, tokenId=%d, delta=%d): %s",
				s.relayInfo.UserId, s.relayInfo.TokenId, quotaDelta, tokenErr.Error()))
		}
	}

	s.relayInfo.PromotionQuotaSettled = s.promotionPreConsumed
	s.syncRelayInfo()
	s.settled = true
	return tokenErr
}

// Refund returns every request reservation. It is idempotent and asynchronous.
func (s *BillingSession) Refund(c *gin.Context) {
	s.mu.Lock()
	if s.settled || s.refunded || !s.needsRefundLocked() {
		s.mu.Unlock()
		return
	}
	s.refunded = true

	tokenId := s.relayInfo.TokenId
	tokenKey := s.relayInfo.TokenKey
	isPlayground := s.relayInfo.IsPlayground
	tokenConsumed := s.tokenConsumed
	extraReserved := s.extraReserved
	subscriptionId := s.relayInfo.SubscriptionId
	funding := s.funding
	promotion := s.promotion
	promotionConsumed := s.promotionConsumed()
	s.mu.Unlock()

	logger.LogInfo(c, fmt.Sprintf("用户 %d 请求失败, 返还预扣费（token_quota=%s, funding=%s）",
		s.relayInfo.UserId, logger.FormatQuota(tokenConsumed), s.billingSource()))

	gopool.Go(func() {
		if err := funding.Refund(); err != nil {
			common.SysLog("error refunding billing source: " + err.Error())
		}
		if extraReserved > 0 && funding.Source() == BillingSourceSubscription && subscriptionId > 0 {
			if err := model.PostConsumeUserSubscriptionDelta(subscriptionId, -int64(extraReserved)); err != nil {
				common.SysLog("error refunding subscription extra reserved quota: " + err.Error())
			}
		}
		if promotion != nil && promotionConsumed > 0 {
			if err := promotion.Refund(); err != nil {
				common.SysLog("error refunding recharge promotion quota: " + err.Error())
			}
		}
		if tokenConsumed > 0 && !isPlayground {
			if err := model.IncreaseTokenQuota(tokenId, tokenKey, tokenConsumed); err != nil {
				common.SysLog("error refunding token quota: " + err.Error())
			}
		}
	})
}

func (s *BillingSession) NeedsRefund() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.needsRefundLocked()
}

func (s *BillingSession) needsRefundLocked() bool {
	if s.settled || s.refunded || s.fundingSettled {
		return false
	}
	if s.tokenConsumed > 0 || s.promotionConsumed() > 0 {
		return true
	}
	switch funding := s.funding.(type) {
	case *WalletFunding:
		return funding.consumed > 0
	case *SubscriptionFunding:
		return funding.preConsumed > 0
	default:
		return false
	}
}

func (s *BillingSession) GetPreConsumedQuota() int {
	return s.preConsumedQuota
}

// Reserve raises the total reservation target. Additional promotion quota is
// consumed first; only the remaining portion is reserved from the fallback.
func (s *BillingSession) Reserve(targetQuota int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settled || s.refunded || s.trusted || targetQuota <= s.preConsumedQuota {
		return nil
	}

	promotionBefore := s.promotionConsumed()
	if s.promotion != nil {
		if _, err := s.promotion.ReserveTarget(targetQuota); err != nil {
			return err
		}
	}
	promotionTarget := s.promotionConsumed()
	if subscription, ok := s.funding.(*SubscriptionFunding); ok && subscription.subscriptionId > 0 {
		// The initial subscription reservation is refunded atomically by request
		// ID. Keep that portion reserved until settlement so a later failed
		// request cannot refund it twice after promotion coverage increases.
		maxPromotionTarget := targetQuota - int(subscription.preConsumed)
		if promotionTarget > maxPromotionTarget {
			if s.promotion == nil {
				return types.NewError(fmt.Errorf("promotion funding is missing"), types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
			}
			if err := s.promotion.RefundTo(maxPromotionTarget); err != nil {
				return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
			}
			promotionTarget = s.promotionConsumed()
		}
	}
	fallbackTarget := targetQuota - promotionTarget
	fallbackDelta := fallbackTarget - s.fallbackPreConsumed
	if err := s.reserveFallback(fallbackDelta); err != nil {
		if s.promotion != nil && s.promotionConsumed() > promotionBefore {
			if rollbackErr := s.promotion.RefundTo(promotionBefore); rollbackErr != nil {
				common.SysLog("error rolling back promotion reserve: " + rollbackErr.Error())
			}
		}
		return err
	}

	tokenDelta := targetQuota - s.preConsumedQuota
	if err := s.reserveToken(tokenDelta); err != nil {
		s.rollbackFallbackReserve(fallbackDelta)
		if s.promotion != nil && s.promotionConsumed() > promotionBefore {
			if rollbackErr := s.promotion.RefundTo(promotionBefore); rollbackErr != nil {
				common.SysLog("error rolling back promotion reserve after token failure: " + rollbackErr.Error())
			}
		}
		return err
	}

	s.preConsumedQuota = targetQuota
	s.tokenConsumed += tokenDelta
	s.promotionPreConsumed = promotionTarget
	s.fallbackPreConsumed = fallbackTarget
	s.syncRelayInfo()
	return nil
}

func (s *BillingSession) preConsume(c *gin.Context, quota int) *types.NewAPIError {
	effectiveQuota := quota
	if s.shouldTrust(c) {
		s.trusted = true
		effectiveQuota = 0
		logger.LogInfo(c, fmt.Sprintf("用户 %d 额度充足, 信任且不需要预扣费 (funding=%s)", s.relayInfo.UserId, s.funding.Source()))
	} else if effectiveQuota > 0 {
		logger.LogInfo(c, fmt.Sprintf("用户 %d 需要预扣费 %s (funding=%s)", s.relayInfo.UserId, logger.FormatQuota(effectiveQuota), s.funding.Source()))
	}

	if effectiveQuota > 0 {
		if err := PreConsumeTokenQuota(s.relayInfo, effectiveQuota); err != nil {
			if s.promotion != nil && s.promotionConsumed() > 0 {
				if rollbackErr := s.promotion.Refund(); rollbackErr != nil {
					common.SysLog("error rolling back recharge promotion quota after token pre-consume failure: " + rollbackErr.Error())
				}
			}
			return types.NewErrorWithStatusCode(err, types.ErrorCodePreConsumeTokenQuotaFailed, http.StatusForbidden, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
		s.tokenConsumed = effectiveQuota
	}

	if s.promotion != nil && effectiveQuota > 0 {
		if _, err := s.promotion.ReserveTarget(effectiveQuota); err != nil {
			if s.promotionConsumed() > 0 {
				if rollbackErr := s.promotion.Refund(); rollbackErr != nil {
					common.SysLog("error rolling back recharge promotion quota after reservation failure: " + rollbackErr.Error())
				}
			}
			s.rollbackTokenPreConsume()
			return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
		}
	}
	fallbackQuota := effectiveQuota - s.promotionConsumed()
	if fallbackQuota < 0 {
		fallbackQuota = 0
	}
	if fallbackQuota > 0 {
		if err := s.funding.PreConsume(fallbackQuota); err != nil {
			if s.promotion != nil && s.promotionConsumed() > 0 {
				if rollbackErr := s.promotion.Refund(); rollbackErr != nil {
					common.SysLog("error rolling back recharge promotion quota: " + rollbackErr.Error())
				}
			}
			s.rollbackTokenPreConsume()
			return s.fundingError(err)
		}
	}

	s.preConsumedQuota = effectiveQuota
	s.promotionPreConsumed = s.promotionConsumed()
	s.fallbackPreConsumed = fallbackQuota
	s.syncRelayInfo()
	return nil
}

func (s *BillingSession) rollbackTokenPreConsume() {
	if s.tokenConsumed > 0 && !s.relayInfo.IsPlayground {
		if rollbackErr := model.IncreaseTokenQuota(s.relayInfo.TokenId, s.relayInfo.TokenKey, s.tokenConsumed); rollbackErr != nil {
			common.SysLog(fmt.Sprintf("error rolling back token quota (userId=%d, tokenId=%d, amount=%d): %s", s.relayInfo.UserId, s.relayInfo.TokenId, s.tokenConsumed, rollbackErr.Error()))
		}
	}
	s.tokenConsumed = 0
}

func (s *BillingSession) fundingError(err error) *types.NewAPIError {
	errMsg := err.Error()
	if strings.Contains(errMsg, "no active subscription") || strings.Contains(errMsg, "subscription quota insufficient") {
		return types.NewErrorWithStatusCode(fmt.Errorf("订阅额度不足或未配置订阅: %s", errMsg), types.ErrorCodeInsufficientUserQuota, http.StatusForbidden, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
	}
	return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
}

func (s *BillingSession) settleFallback(delta int) error {
	if delta == 0 {
		return nil
	}
	return s.funding.Settle(delta)
}

func (s *BillingSession) reserveFallback(delta int) error {
	if delta == 0 {
		return nil
	}
	if delta < 0 {
		return s.releaseFallbackReserve(-delta)
	}
	switch funding := s.funding.(type) {
	case *WalletFunding:
		if err := model.DecreaseUserQuota(funding.userId, delta, false); err != nil {
			return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
		}
		funding.consumed += delta
		return nil
	case *SubscriptionFunding:
		if funding.subscriptionId == 0 {
			funding.amount = int64(delta)
			if err := funding.PreConsume(0); err != nil {
				return s.fundingError(err)
			}
			return nil
		}
		if err := model.PostConsumeUserSubscriptionDelta(funding.subscriptionId, int64(delta)); err != nil {
			return s.fundingError(err)
		}
		s.extraReserved += delta
		return nil
	default:
		return types.NewError(fmt.Errorf("unsupported funding source: %s", s.funding.Source()), types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
	}
}

func (s *BillingSession) releaseFallbackReserve(amount int) error {
	if amount <= 0 {
		return nil
	}
	switch funding := s.funding.(type) {
	case *WalletFunding:
		if err := model.IncreaseUserQuota(funding.userId, amount, false); err != nil {
			return err
		}
		funding.consumed -= amount
		if funding.consumed < 0 {
			funding.consumed = 0
		}
		return nil
	case *SubscriptionFunding:
		if funding.subscriptionId == 0 {
			return nil
		}
		if err := model.PostConsumeUserSubscriptionDelta(funding.subscriptionId, -int64(amount)); err != nil {
			return err
		}
		if s.extraReserved >= amount {
			s.extraReserved -= amount
		} else {
			s.relayInfo.SubscriptionPostDelta -= int64(amount - s.extraReserved)
			s.extraReserved = 0
		}
		return nil
	default:
		return fmt.Errorf("unsupported funding source: %s", s.funding.Source())
	}
}

func (s *BillingSession) rollbackFallbackReserve(delta int) {
	if delta > 0 {
		if err := s.releaseFallbackReserve(delta); err != nil {
			common.SysLog("error rolling back fallback reserve: " + err.Error())
		}
		return
	}
	if delta < 0 {
		if subscription, ok := s.funding.(*SubscriptionFunding); ok && subscription.subscriptionId > 0 {
			if err := model.PostConsumeUserSubscriptionDelta(subscription.subscriptionId, int64(-delta)); err != nil {
				common.SysLog("error restoring subscription fallback reserve: " + err.Error())
			} else {
				s.relayInfo.SubscriptionPostDelta += int64(-delta)
			}
			return
		}
		if err := s.reserveFallback(-delta); err != nil {
			common.SysLog("error restoring fallback reserve: " + err.Error())
		}
	}
}

func (s *BillingSession) reserveToken(delta int) error {
	if delta <= 0 || s.relayInfo.IsPlayground {
		return nil
	}
	if err := PreConsumeTokenQuota(s.relayInfo, delta); err != nil {
		return types.NewErrorWithStatusCode(err, types.ErrorCodePreConsumeTokenQuotaFailed, http.StatusForbidden, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
	}
	return nil
}

func (s *BillingSession) promotionConsumed() int {
	if s.promotion == nil {
		return 0
	}
	return s.promotion.consumed
}

func (s *BillingSession) shouldTrust(c *gin.Context) bool {
	if s.relayInfo.ForcePreConsume || s.promotionConsumed() > 0 {
		return false
	}
	trustQuota := common.GetTrustQuota()
	if trustQuota <= 0 {
		return false
	}
	tokenTrusted := s.relayInfo.TokenUnlimited
	if !tokenTrusted {
		tokenTrusted = c.GetInt("token_quota") > trustQuota
	}
	if !tokenTrusted {
		return false
	}
	return s.funding.Source() == BillingSourceWallet && s.relayInfo.UserQuota > trustQuota
}

func (s *BillingSession) billingSource() string {
	promotion := s.promotionConsumed() > 0
	fallback := s.fallbackPreConsumed > 0
	switch {
	case promotion && fallback:
		return BillingSourceMixed
	case promotion:
		return BillingSourceRechargePromotion
	default:
		return s.funding.Source()
	}
}

func (s *BillingSession) syncRelayInfo() {
	info := s.relayInfo
	info.FinalPreConsumedQuota = s.preConsumedQuota
	info.BillingSource = s.billingSource()
	info.PromotionQuotaPreConsumed = s.promotionPreConsumed
	if s.promotion != nil {
		info.PromotionModelName = s.promotion.modelName
		info.PromotionQuotaRefunded = s.promotion.refunded
		info.PromotionConsumes = make([]relaycommon.PromotionConsumeInfo, 0, len(s.promotion.consumes))
		for _, consume := range s.promotion.consumes {
			info.PromotionConsumes = append(info.PromotionConsumes, relaycommon.PromotionConsumeInfo{
				GrantId:     consume.GrantId,
				RecordId:    consume.RecordId,
				PreConsumed: consume.PreConsumed,
				Refunded:    consume.Refunded,
				TotalQuota:  consume.TotalQuota,
				UsedAfter:   consume.UsedAfter,
				ExpiresAt:   consume.ExpiresAt,
			})
		}
	} else {
		info.PromotionConsumes = nil
		info.PromotionQuotaPreConsumed = 0
		info.PromotionQuotaRefunded = 0
	}

	if sub, ok := s.funding.(*SubscriptionFunding); ok {
		info.SubscriptionId = sub.subscriptionId
		info.SubscriptionPreConsumed = sub.preConsumed + int64(s.extraReserved)
		info.SubscriptionAmountTotal = sub.AmountTotal
		info.SubscriptionAmountUsedAfterPreConsume = sub.AmountUsedAfter + int64(s.extraReserved)
		info.SubscriptionPlanId = sub.PlanId
		info.SubscriptionPlanTitle = sub.PlanTitle
	} else {
		info.SubscriptionId = 0
		info.SubscriptionPreConsumed = 0
		info.SubscriptionPostDelta = 0
		info.SubscriptionAmountTotal = 0
		info.SubscriptionAmountUsedAfterPreConsume = 0
		info.SubscriptionPlanId = 0
		info.SubscriptionPlanTitle = ""
	}
}

// NewBillingSession reserves matching model-specific promotion quota first and
// routes only the uncovered amount through the user's existing billing policy.
func NewBillingSession(c *gin.Context, relayInfo *relaycommon.RelayInfo, preConsumedQuota int) (*BillingSession, *types.NewAPIError) {
	if relayInfo == nil {
		return nil, types.NewError(fmt.Errorf("relayInfo is nil"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}

	promotion := &RechargePromotionFunding{
		requestId: relayInfo.RequestId,
		userId:    relayInfo.UserId,
		modelName: relayInfo.PromotionModelName,
	}
	if relayInfo.PromotionModelName == "" {
		promotion = nil
	}
	if promotion != nil {
		if _, err := promotion.ReserveTarget(preConsumedQuota); err != nil {
			return nil, types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
		}
	}
	promotionConsumed := 0
	if promotion != nil {
		promotionConsumed = promotion.consumed
	}
	fallbackQuota := preConsumedQuota - promotionConsumed
	if fallbackQuota < 0 {
		fallbackQuota = 0
	}
	cleanupPromotion := func() {
		if promotion == nil || promotion.consumed == 0 {
			return
		}
		if err := promotion.Refund(); err != nil {
			common.SysLog("error rolling back recharge promotion reservation: " + err.Error())
		}
	}

	pref := common.NormalizeBillingPreference(relayInfo.UserSetting.BillingPreference)
	newSession := func(funding FundingSource) *BillingSession {
		return &BillingSession{relayInfo: relayInfo, funding: funding, promotion: promotion}
	}

	tryWallet := func() (*BillingSession, *types.NewAPIError) {
		if fallbackQuota > 0 {
			userQuota, err := model.GetUserQuota(relayInfo.UserId, false)
			if err != nil {
				cleanupPromotion()
				return nil, types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
			}
			if userQuota <= 0 || userQuota < fallbackQuota {
				cleanupPromotion()
				return nil, types.NewErrorWithStatusCode(
					fmt.Errorf("预扣费额度失败, 用户剩余额度: %s, 需要预扣费额度: %s", logger.FormatQuota(userQuota), logger.FormatQuota(fallbackQuota)),
					types.ErrorCodeInsufficientUserQuota, http.StatusForbidden,
					types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
			}
			relayInfo.UserQuota = userQuota
		}
		session := newSession(&WalletFunding{userId: relayInfo.UserId})
		if apiErr := session.preConsume(c, preConsumedQuota); apiErr != nil {
			return nil, apiErr
		}
		return session, nil
	}

	trySubscription := func() (*BillingSession, *types.NewAPIError) {
		session := newSession(&SubscriptionFunding{
			requestId: relayInfo.RequestId,
			userId:    relayInfo.UserId,
			modelName: relayInfo.OriginModelName,
			amount:    int64(fallbackQuota),
		})
		if apiErr := session.preConsume(c, preConsumedQuota); apiErr != nil {
			return nil, apiErr
		}
		return session, nil
	}

	switch pref {
	case "subscription_only":
		return trySubscription()
	case "wallet_only":
		return tryWallet()
	case "wallet_first":
		session, apiErr := tryWallet()
		if apiErr != nil {
			if apiErr.GetErrorCode() == types.ErrorCodeInsufficientUserQuota {
				if promotion != nil {
					if _, err := promotion.ReserveTarget(preConsumedQuota); err != nil {
						return nil, types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
					}
					fallbackQuota = preConsumedQuota - promotion.consumed
				}
				return trySubscription()
			}
			return nil, apiErr
		}
		return session, nil
	case "subscription_first":
		fallthrough
	default:
		hasSub, err := model.HasActiveUserSubscription(relayInfo.UserId)
		if err != nil {
			cleanupPromotion()
			return nil, types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		}
		if !hasSub {
			return tryWallet()
		}
		session, apiErr := trySubscription()
		if apiErr == nil {
			return session, nil
		}
		if apiErr.GetErrorCode() != types.ErrorCodeInsufficientUserQuota {
			return nil, apiErr
		}
		allowOverflow, err := model.UserActiveSubscriptionsAllowWalletOverflow(relayInfo.UserId)
		if err != nil {
			return nil, types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		}
		if !allowOverflow {
			return nil, apiErr
		}
		if promotion != nil {
			if _, err := promotion.ReserveTarget(preConsumedQuota); err != nil {
				return nil, types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
			}
			fallbackQuota = preConsumedQuota - promotion.consumed
		}
		return tryWallet()
	}
}
