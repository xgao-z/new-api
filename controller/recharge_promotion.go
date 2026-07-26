package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RechargePromotionRequest struct {
	Promotion model.RechargePromotion `json:"promotion"`
}

func ListRechargePromotions(c *gin.Context) {
	var promotions []model.RechargePromotion
	if err := model.DB.Preload("Tiers").Order("priority desc, id desc").Find(&promotions).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	for index := range promotions {
		model.PopulateRechargePromotionGiftAmounts(&promotions[index])
	}
	common.ApiSuccess(c, promotions)
}

func CreateRechargePromotion(c *gin.Context) {
	var req RechargePromotionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	if err := model.ValidateRechargePromotion(&req.Promotion); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		for index := range req.Promotion.Tiers {
			req.Promotion.Tiers[index].Id = 0
			req.Promotion.Tiers[index].PromotionId = 0
		}
		req.Promotion.Id = 0
		return tx.Create(&req.Promotion).Error
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "recharge_promotion.create", map[string]interface{}{
		"promotion_id": req.Promotion.Id,
		"name":         req.Promotion.Name,
	})
	common.ApiSuccess(c, req.Promotion)
}

func UpdateRechargePromotion(c *gin.Context) {
	promotionID, _ := strconv.Atoi(c.Param("id"))
	if promotionID <= 0 {
		common.ApiErrorMsg(c, "Invalid ID")
		return
	}
	var req RechargePromotionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "Invalid request")
		return
	}
	req.Promotion.Id = promotionID
	if err := model.ValidateRechargePromotion(&req.Promotion); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		var existing model.RechargePromotion
		if err := tx.Where("id = ?", promotionID).First(&existing).Error; err != nil {
			return err
		}
		if err := tx.Model(&existing).Updates(map[string]interface{}{
			"name":       req.Promotion.Name,
			"enabled":    req.Promotion.Enabled,
			"priority":   req.Promotion.Priority,
			"start_time": req.Promotion.StartTime,
			"end_time":   req.Promotion.EndTime,
		}).Error; err != nil {
			return err
		}
		if err := tx.Where("promotion_id = ?", promotionID).Delete(&model.RechargePromotionTier{}).Error; err != nil {
			return err
		}
		for index := range req.Promotion.Tiers {
			tier := req.Promotion.Tiers[index]
			tier.Id = 0
			tier.PromotionId = promotionID
			if err := tx.Create(&tier).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.Status(http.StatusNotFound)
			return
		}
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "recharge_promotion.update", map[string]interface{}{
		"promotion_id": promotionID,
		"name":         req.Promotion.Name,
	})
	common.ApiSuccess(c, nil)
}

func DeleteRechargePromotion(c *gin.Context) {
	promotionID, _ := strconv.Atoi(c.Param("id"))
	if promotionID <= 0 {
		common.ApiErrorMsg(c, "Invalid ID")
		return
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("promotion_id = ?", promotionID).Delete(&model.RechargePromotionTier{}).Error; err != nil {
			return err
		}
		result := tx.Delete(&model.RechargePromotion{}, promotionID)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	}); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.Status(http.StatusNotFound)
			return
		}
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "recharge_promotion.delete", map[string]interface{}{
		"promotion_id": promotionID,
	})
	common.ApiSuccess(c, nil)
}

func GetSelfRechargePromotionGrants(c *gin.Context) {
	grants, err := model.GetUserRechargePromotionGrants(c.GetInt("id"), true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, grants)
}
