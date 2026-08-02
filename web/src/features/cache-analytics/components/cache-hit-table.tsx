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
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Table2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { formatRate } from '../lib/format'
import type { CacheHitStatItem } from '../types'

const PAGE_SIZE = 10

type SortKey =
  | 'channel_name'
  | 'model_name'
  | 'requests'
  | 'hits'
  | 'hit_rate'
  | 'cache_tokens'
  | 'prompt_tokens'
  | 'token_cache_ratio'
  | 'cache_write_tokens'

type SortDirection = 'asc' | 'desc'

function sortValue(item: CacheHitStatItem, key: SortKey): string | number {
  return item[key]
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: SortDirection
}) {
  if (!active) {
    return <ArrowUpDown className='size-3 opacity-40' aria-hidden='true' />
  }
  return direction === 'asc' ? (
    <ArrowUp className='size-3' aria-hidden='true' />
  ) : (
    <ArrowDown className='size-3' aria-hidden='true' />
  )
}

interface CacheHitTableProps {
  items: CacheHitStatItem[]
  loading?: boolean
}

export function CacheHitTable({ items, loading }: CacheHitTableProps) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<SortKey>('requests')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  const sorted = useMemo(() => {
    const list = [...items]
    const direction = sortDirection === 'asc' ? 1 : -1
    list.sort((a, b) => {
      const aValue = sortValue(a, sortKey)
      const bValue = sortValue(b, sortKey)
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction
      }
      return String(aValue).localeCompare(String(bValue)) * direction
    })
    return list
  }, [items, sortDirection, sortKey])

  // Re-sorting or changing the dataset must reset the view to the first page,
  // otherwise the user can be stranded on a page that no longer exists.
  useEffect(() => {
    setCurrentPage(1)
  }, [sortKey, sortDirection, items])

  const totalCount = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const paged = sorted.slice(startIndex, startIndex + PAGE_SIZE)
  const showPagination = totalCount > PAGE_SIZE

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const columns: Array<{ key: SortKey; label: string; align?: 'right' }> = [
    { key: 'channel_name', label: t('Channel') },
    { key: 'model_name', label: t('Model') },
    { key: 'requests', label: t('Requests'), align: 'right' },
    { key: 'hits', label: t('Cache Hit Requests'), align: 'right' },
    { key: 'hit_rate', label: t('Request Hit Rate'), align: 'right' },
    { key: 'cache_tokens', label: t('Cache Tokens'), align: 'right' },
    { key: 'prompt_tokens', label: t('Prompt Tokens'), align: 'right' },
    { key: 'token_cache_ratio', label: t('Token Cache Ratio'), align: 'right' },
    { key: 'cache_write_tokens', label: t('Cache Write Tokens'), align: 'right' },
  ]

  return (
    <div className='bg-card overflow-hidden rounded-xl border'>
      <div className='flex items-center gap-2 border-b px-3 py-2.5 sm:px-4'>
        <IconBadge tone='chart-2' size='sm'>
          <Table2 aria-hidden='true' />
        </IconBadge>
        <div className='text-sm font-semibold'>
          {t('Cache Hit by Channel & Model')}
        </div>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[860px] text-sm'>
          <thead>
            <tr className='bg-muted/40 text-muted-foreground border-b text-xs'>
              {columns.map((column) => (
                <th key={column.key} className='px-3 py-2.5 font-medium sm:px-4'>
                  <button
                    type='button'
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                      column.align === 'right' && 'flex-row-reverse',
                      sortKey === column.key && 'text-foreground'
                    )}
                  >
                    <span className='whitespace-nowrap'>{column.label}</span>
                    <SortIndicator
                      active={sortKey === column.key}
                      direction={sortDirection}
                    />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }, (_, index) => (
                <tr key={index} className='border-b last:border-0'>
                  {columns.map((column) => (
                    <td key={column.key} className='px-3 py-2.5 sm:px-4'>
                      <Skeleton className='h-4 w-16' />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className='text-muted-foreground px-3 py-10 text-center sm:px-4'
                >
                  {t('No data')}
                </td>
              </tr>
            )}
            {!loading &&
              paged.length > 0 &&
              paged.map((item) => (
                <tr
                  key={`${item.channel_id}-${item.model_name}`}
                  className='border-b transition-colors last:border-0 hover:bg-muted/30'
                >
                  <td className='px-3 py-2.5 sm:px-4'>
                    {item.channel_name || `#${item.channel_id}`}
                  </td>
                  <td className='px-3 py-2.5 font-medium sm:px-4'>
                    {item.model_name}
                  </td>
                  <td className='px-3 py-2.5 text-right tabular-nums sm:px-4'>
                    {formatNumber(item.requests)}
                  </td>
                  <td className='px-3 py-2.5 text-right tabular-nums sm:px-4'>
                    {formatNumber(item.hits)}
                  </td>
                  <td className='px-3 py-2.5 text-right font-medium tabular-nums sm:px-4'>
                    {formatRate(item.hit_rate)}
                  </td>
                  <td className='px-3 py-2.5 text-right tabular-nums sm:px-4'>
                    {formatCompactNumber(item.cache_tokens)}
                  </td>
                  <td className='px-3 py-2.5 text-right tabular-nums sm:px-4'>
                    {formatCompactNumber(item.prompt_tokens)}
                  </td>
                  <td className='px-3 py-2.5 text-right tabular-nums sm:px-4'>
                    {formatRate(item.token_cache_ratio)}
                  </td>
                  <td className='px-3 py-2.5 text-right tabular-nums sm:px-4'>
                    {formatCompactNumber(item.cache_write_tokens)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {showPagination && !loading && (
        <div className='bg-muted/40 flex items-center justify-between border-t px-3 py-2 text-sm'>
          <div className='text-muted-foreground text-sm'>
            {t('Page {{current}} of {{total}}', {
              current: safePage,
              total: totalPages,
            })}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8'
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
              aria-label={t('Previous page')}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8'
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={safePage === totalPages}
              aria-label={t('Next page')}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
