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
export interface CacheHitStatItem {
  channel_id: number
  channel_name: string
  model_name: string
  requests: number
  hits: number
  /** Fraction in [0, 1]: hits / requests */
  hit_rate: number
  cache_tokens: number
  prompt_tokens: number
  /** Fraction in [0, 1]: cache_tokens / prompt_tokens */
  token_cache_ratio: number
  cache_write_tokens: number
}

export interface CacheHitTrendPoint {
  /** Bucket start, unix seconds */
  bucket: number
  requests: number
  hits: number
  hit_rate: number
  cache_tokens: number
  prompt_tokens: number
}

export interface CacheHitStatsSummary {
  requests: number
  hits: number
  hit_rate: number
  cache_tokens: number
  prompt_tokens: number
  token_cache_ratio: number
  cache_write_tokens: number
}

export interface CacheHitStatsData {
  items: CacheHitStatItem[]
  trend: CacheHitTrendPoint[]
  summary: CacheHitStatsSummary
}

export interface CacheHitStatsResponse {
  success: boolean
  message?: string
  data?: CacheHitStatsData
}

export interface CacheHitStatsParams {
  start_timestamp: number
  end_timestamp: number
  channel_id?: number
  model_name?: string
}
