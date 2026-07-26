/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { api } from '@/lib/api'

export interface RechargePromotionTier {
  id?: number
  min_payment_amount: number
  model_name: string
  gift_amount: number
  quota?: number
  expire_days: number
}

export interface RechargePromotion {
  id: number
  name: string
  enabled: boolean
  priority: number
  start_time: number
  end_time: number
  tiers: RechargePromotionTier[]
}

export interface RechargePromotionInput {
  name: string
  enabled: boolean
  priority: number
  start_time: number
  end_time: number
  tiers: RechargePromotionTier[]
}

interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

export async function getRechargePromotions(): Promise<
  ApiResponse<RechargePromotion[]>
> {
  const res = await api.get('/api/recharge-promotion/')
  return res.data
}

export async function createRechargePromotion(
  promotion: RechargePromotionInput
): Promise<ApiResponse<RechargePromotion>> {
  const res = await api.post('/api/recharge-promotion/', { promotion })
  return res.data
}

export async function updateRechargePromotion(
  id: number,
  promotion: RechargePromotionInput
): Promise<ApiResponse> {
  const res = await api.put(`/api/recharge-promotion/${id}`, { promotion })
  return res.data
}

export async function deleteRechargePromotion(
  id: number
): Promise<ApiResponse> {
  const res = await api.delete(`/api/recharge-promotion/${id}`)
  return res.data
}
