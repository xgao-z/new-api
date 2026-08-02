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
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CompactDateTimeRangePicker } from '@/components/compact-date-time-range-picker'
import { SectionPageLayout } from '@/components/layout/components/section-page-layout'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import dayjs from '@/lib/dayjs'
import type { TimeGranularity } from '@/lib/time'

import { getAllChannelsForFilter, getCacheHitStats } from './api'
import { CacheHitOverviewCards } from './components/cache-hit-overview-cards'
import { CacheHitTable } from './components/cache-hit-table'

const CacheHitTrendChart = lazy(() =>
  import('./components/cache-hit-trend-chart').then((module) => ({
    default: module.CacheHitTrendChart,
  }))
)

function toTimestamp(date?: Date): number {
  return date ? Math.floor(date.getTime() / 1000) : 0
}

export function CacheAnalyticsPage() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState<{ start?: Date; end?: Date }>(
    () => ({
      start: dayjs().subtract(7, 'day').startOf('day').toDate(),
      end: dayjs().toDate(),
    })
  )
  const [channelId, setChannelId] = useState<number | undefined>(undefined)
  const [modelName, setModelName] = useState('')
  const [debouncedModelName, setDebouncedModelName] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedModelName(modelName.trim()), 400)
    return () => clearTimeout(timer)
  }, [modelName])

  const startTimestamp = toTimestamp(timeRange.start)
  const endTimestamp = toTimestamp(timeRange.end)

  const statsQuery = useQuery({
    queryKey: [
      'cache-hit-stats',
      startTimestamp,
      endTimestamp,
      channelId,
      debouncedModelName,
    ],
    queryFn: () =>
      getCacheHitStats({
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        channel_id: channelId,
        model_name: debouncedModelName || undefined,
      }),
    enabled:
      startTimestamp > 0 && endTimestamp > 0 && endTimestamp >= startTimestamp,
    staleTime: 60 * 1000,
  })

  const channelsQuery = useQuery({
    queryKey: ['cache-analytics-channels'],
    queryFn: getAllChannelsForFilter,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (statsQuery.data && !statsQuery.data.success) {
      toast.error(statsQuery.data.message || t('Failed to load cache hit statistics'))
    }
  }, [statsQuery.data, t])

  const granularity: TimeGranularity =
    endTimestamp - startTimestamp <= 48 * 3600 ? 'hour' : 'day'
  const data = statsQuery.data?.data
  const loading = statsQuery.isFetching

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Cache Hit Rate')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-3 sm:gap-4'>
          <div className='bg-card flex flex-wrap items-center gap-2 rounded-xl border p-2.5 sm:p-3'>
            <CompactDateTimeRangePicker
              start={timeRange.start}
              end={timeRange.end}
              onChange={setTimeRange}
              className='h-8 w-full sm:w-auto sm:min-w-[200px]'
            />
            <Select
              value={channelId ? String(channelId) : ''}
              onValueChange={(value) =>
                setChannelId(value ? Number(value) : undefined)
              }
            >
              <SelectTrigger className='h-8 w-full sm:w-44'>
                <SelectValue placeholder={t('All Channels')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value=''>{t('All Channels')}</SelectItem>
                  {(channelsQuery.data ?? []).map((channel) => (
                    <SelectItem key={channel.id} value={String(channel.id)}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              placeholder={t('Filter by model')}
              className='h-8 w-full sm:w-40'
            />
          </div>
          <CacheHitOverviewCards summary={data?.summary} loading={loading} />
          <Suspense fallback={<Skeleton className='h-64 sm:h-80' />}>
            <CacheHitTrendChart
              points={data?.trend ?? []}
              granularity={granularity}
              loading={loading}
            />
          </Suspense>
          <CacheHitTable items={data?.items ?? []} loading={loading} />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
