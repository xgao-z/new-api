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

import type {
  CacheHitStatsParams,
  CacheHitStatsResponse,
} from './types'

export async function getCacheHitStats(
  params: CacheHitStatsParams
): Promise<CacheHitStatsResponse> {
  const res = await api.get('/api/log/cache_hit_stats', { params })
  return res.data
}

const CHANNEL_LIST_PAGE_SIZE = 100

/**
 * Fetch every channel (id + name) for the filter select. The admin list
 * endpoint caps page_size at 100, so walk the pages until `total` is covered.
 */
export async function getAllChannelsForFilter(): Promise<
  Array<{ id: number; name: string }>
> {
  const channels: Array<{ id: number; name: string }> = []
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await api.get('/api/channel', {
      params: { p: page, page_size: CHANNEL_LIST_PAGE_SIZE },
    })
    const data = res.data?.data
    const items: Array<{ id: number; name: string }> | undefined = data?.items
    if (!items?.length) break
    channels.push(
      ...items.map((channel) => ({ id: channel.id, name: channel.name }))
    )
    if (
      items.length < CHANNEL_LIST_PAGE_SIZE ||
      channels.length >= Number(data?.total ?? 0)
    ) {
      break
    }
    page += 1
  }
  return channels
}
