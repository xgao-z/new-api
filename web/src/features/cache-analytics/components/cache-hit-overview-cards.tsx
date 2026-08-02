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
import { Activity, Database, Gauge, Percent, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { formatRate } from '../lib/format'
import type { CacheHitStatsSummary } from '../types'

interface OverviewCardProps {
  title: string
  value: string
  description: string
  icon: typeof Activity
  tone: IconBadgeTone
  loading?: boolean
}

function OverviewCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
  loading,
}: OverviewCardProps) {
  return (
    <div className='bg-card flex flex-col gap-2.5 rounded-xl border p-3 sm:p-4'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-muted-foreground text-xs font-medium sm:text-[13px]'>
          {title}
        </span>
        <IconBadge tone={tone} size='stat'>
          <Icon aria-hidden='true' />
        </IconBadge>
      </div>
      {loading ? (
        <Skeleton className='h-6 w-20' />
      ) : (
        <div className='text-foreground text-xl font-semibold tracking-tight tabular-nums sm:text-2xl'>
          {value}
        </div>
      )}
      <span
        className={cn(
          'text-muted-foreground text-[11px] leading-snug sm:text-xs',
          loading && 'opacity-0'
        )}
      >
        {description}
      </span>
    </div>
  )
}

interface CacheHitOverviewCardsProps {
  summary?: CacheHitStatsSummary
  loading?: boolean
}

export function CacheHitOverviewCards({
  summary,
  loading,
}: CacheHitOverviewCardsProps) {
  const { t } = useTranslation()
  const s = summary ?? {
    requests: 0,
    hits: 0,
    hit_rate: 0,
    cache_tokens: 0,
    prompt_tokens: 0,
    token_cache_ratio: 0,
    cache_write_tokens: 0,
  }

  const cards = [
    {
      id: 'requests',
      title: t('Total Requests'),
      value: formatNumber(s.requests),
      description: t('Consume requests in the selected range'),
      icon: Activity,
      tone: 'chart-1' as IconBadgeTone,
    },
    {
      id: 'hits',
      title: t('Cache Hit Requests'),
      value: formatNumber(s.hits),
      description: t('Requests that read cached tokens'),
      icon: Zap,
      tone: 'chart-2' as IconBadgeTone,
    },
    {
      id: 'hitRate',
      title: t('Request Hit Rate'),
      value: formatRate(s.hit_rate),
      description: t('Cache hits as a share of requests'),
      icon: Gauge,
      tone: 'chart-3' as IconBadgeTone,
    },
    {
      id: 'cacheTokens',
      title: t('Cache Tokens'),
      value: formatCompactNumber(s.cache_tokens),
      description: t('Cached tokens read from upstream'),
      icon: Database,
      tone: 'chart-4' as IconBadgeTone,
    },
    {
      id: 'tokenRatio',
      title: t('Token Cache Ratio'),
      value: formatRate(s.token_cache_ratio),
      description: t('Cached tokens as a share of prompt tokens'),
      icon: Percent,
      tone: 'chart-5' as IconBadgeTone,
    },
  ]

  return (
    <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5'>
      {cards.map((card) => (
        <OverviewCard key={card.id} {...card} loading={loading} />
      ))}
    </div>
  )
}
