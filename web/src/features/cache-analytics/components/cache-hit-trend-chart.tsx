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
import { VChart } from '@visactor/react-vchart'
import { LineChart as LineChartIcon } from 'lucide-react'
import { useEffect, useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { useTheme } from '@/context/theme-provider'
import { formatNumber } from '@/lib/format'
import { formatChartTime, type TimeGranularity } from '@/lib/time'
import { useThemeRadiusPx } from '@/lib/theme-radius'
import { VCHART_OPTION } from '@/lib/vchart'

import { formatRate } from '../lib/format'
import type { CacheHitTrendPoint } from '../types'

const REQUESTS_BAR_COLOR = '#5B8FF9'
const HIT_RATE_LINE_COLOR = '#9270CA'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

interface CacheHitTrendChartProps {
  points: CacheHitTrendPoint[]
  granularity: TimeGranularity
  loading?: boolean
}

export function CacheHitTrendChart({
  points,
  granularity,
  loading,
}: CacheHitTrendChartProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { customization } = useThemeCustomization()
  const chartRadius = useThemeRadiusPx(
    '--radius-md',
    `${customization.preset}:${customization.radius}`
  )
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)

      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }

      const ThemeManager = await themeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }

    updateTheme()
  }, [resolvedTheme])

  const chartData = useMemo(
    () =>
      points.map((point) => ({
        time: formatChartTime(Number(point.bucket), granularity),
        requests: point.requests,
        hit_rate: point.hit_rate,
      })),
    [granularity, points]
  )

  const spec = useMemo(() => {
    const requestLabel = t('Requests')
    const hitRateLabel = t('Hit Rate')
    return {
      type: 'common',
      data: [{ id: 'cacheHitTrend', values: chartData }],
      series: [
        {
          type: 'bar',
          xField: 'time',
          yField: 'requests',
          bar: {
            style: {
              fill: REQUESTS_BAR_COLOR,
              cornerRadius: chartRadius,
            },
          },
        },
        {
          type: 'line',
          xField: 'time',
          yField: 'hit_rate',
          line: {
            style: {
              stroke: HIT_RATE_LINE_COLOR,
              lineWidth: 2,
              curveType: 'monotone',
            },
          },
          point: { visible: false },
        },
      ],
      axes: [
        {
          orient: 'bottom',
          type: 'band',
          label: { style: { fontSize: 11 } },
          grid: { visible: false },
        },
        {
          orient: 'left',
          type: 'linear',
          seriesIndex: [0],
          title: { visible: true, text: requestLabel },
          label: { style: { fontSize: 11 } },
          grid: { visible: true },
        },
        {
          orient: 'right',
          type: 'linear',
          seriesIndex: [1],
          title: { visible: true, text: hitRateLabel },
          label: {
            style: { fontSize: 11 },
            formatMethod: (value: number) => `${(Number(value) * 100).toFixed(0)}%`,
          },
          grid: { visible: false },
        },
      ],
      tooltip: {
        dimension: {
          content: [
            {
              key: requestLabel,
              value: (datum: Record<string, unknown>) =>
                formatNumber(Number(datum?.requests) || 0),
            },
            {
              key: hitRateLabel,
              value: (datum: Record<string, unknown>) =>
                formatRate(Number(datum?.hit_rate) || 0),
            },
          ],
        },
      },
      legends: { visible: false },
      background: { fill: 'transparent' },
      animation: true,
    }
  }, [chartData, chartRadius, t])

  const chartKey = [
    'cache-hit-trend',
    loading ? 'loading' : 'ready',
    chartData.length,
    resolvedTheme,
    customization.preset,
  ].join('-')

  return (
    <div className='bg-card overflow-hidden rounded-xl border'>
      <div className='flex items-center gap-2 border-b px-3 py-2.5 sm:px-4'>
        <IconBadge tone='chart-4' size='sm'>
          <LineChartIcon aria-hidden='true' />
        </IconBadge>
        <div className='text-sm font-semibold'>{t('Cache Hit Trend')}</div>
      </div>
      <div className='h-64 p-2 sm:h-80 sm:p-3'>
        {loading && <Skeleton className='size-full' />}
        {!loading && chartData.length === 0 && (
          <div className='text-muted-foreground flex size-full items-center justify-center text-sm'>
            {t('No data')}
          </div>
        )}
        {!loading && chartData.length > 0 && themeReady && (
          <VChart
            key={chartKey}
            spec={{
              ...spec,
              theme: resolvedTheme === 'dark' ? 'dark' : 'light',
              background: 'transparent',
            }}
            option={VCHART_OPTION}
          />
        )}
      </div>
    </div>
  )
}
