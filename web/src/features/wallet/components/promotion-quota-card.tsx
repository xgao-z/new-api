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
import { Gift, Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { formatQuota } from '@/lib/format'

import type { RechargePromotionGrant } from '../types'

interface PromotionQuotaCardProps {
  grants: RechargePromotionGrant[]
  loading?: boolean
}

export function PromotionQuotaCard(props: PromotionQuotaCardProps) {
  const { t } = useTranslation()

  if (props.loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
          <Skeleton className='h-5 w-48' />
        </CardHeader>
        <CardContent className='p-3 sm:p-5'>
          <Skeleton className='h-14 w-full' />
        </CardContent>
      </Card>
    )
  }

  if (props.grants.length === 0) {
    return null
  }

  return (
    <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
      <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
        <div className='flex items-center gap-2'>
          <IconBadge tone='warning' size='md'>
            <Gift />
          </IconBadge>
          <div>
            <h2 className='text-sm font-semibold'>
              {t('Model-Specific Quota')}
            </h2>
            <p className='text-muted-foreground text-xs'>
              {t('Used before your subscription or wallet balance')}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className='divide-y p-0'>
        {props.grants.map((grant) => {
          const remaining = Math.max(0, grant.total_quota - grant.used_quota)
          const isExpired = grant.status === 'expired'
          const expiresAt = new Date(grant.expires_at * 1000)
          return (
            <div
              key={grant.id}
              className='flex min-w-0 items-center justify-between gap-4 px-3 py-3 sm:px-5'
            >
              <div className='min-w-0'>
                <div className='truncate font-mono text-sm font-medium'>
                  {grant.model_name}
                </div>
                <div className='text-muted-foreground mt-1 flex items-center gap-1.5 text-xs'>
                  <Clock3 className='size-3.5' />
                  <span>
                    {isExpired
                      ? t('Expired')
                      : t('Expires {{date}}', {
                          date: expiresAt.toLocaleDateString(),
                        })}
                  </span>
                </div>
              </div>
              <div className='shrink-0 text-right'>
                <div className='font-mono text-sm font-semibold tabular-nums'>
                  {formatQuota(remaining)}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {t('{{used}} of {{total}} used', {
                    used: formatQuota(grant.used_quota),
                    total: formatQuota(grant.total_quota),
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
