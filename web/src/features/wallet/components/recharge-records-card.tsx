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
import { ChevronLeft, ChevronRight, Receipt, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
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
import { TitledCard } from '@/components/ui/titled-card'
import { CopyButton } from '@/components/copy-button'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import { useBillingHistory } from '../hooks/use-billing-history'
import {
  formatTimestamp,
  getPaymentMethodName,
  getStatusConfig,
} from '../lib/billing'
import type { TopupRecord } from '../types'

const PAGE_SIZE_OPTIONS = [
  { value: '10', labelKey: '10 / page' },
  { value: '20', labelKey: '20 / page' },
  { value: '50', labelKey: '50 / page' },
  { value: '100', labelKey: '100 / page' },
] as const

export function RechargeRecordsCard() {
  const { t } = useTranslation()
  const {
    records,
    total,
    page,
    pageSize,
    keyword,
    loading,
    completing,
    isAdmin,
    handlePageChange,
    handlePageSizeChange,
    handleSearch,
    handleCompleteOrder,
  } = useBillingHistory()

  const [confirmTradeNo, setConfirmTradeNo] = useState<string | null>(null)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const columns = useMemo(
    () => [
      {
        id: 'trade_no',
        header: t('Order Number'),
        cell: (record: TopupRecord) => (
          <div className='flex min-w-0 items-center gap-1.5'>
            <code className='text-foreground truncate font-mono text-xs sm:text-sm'>
              {record.trade_no}
            </code>
            <CopyButton
              value={record.trade_no}
              variant='ghost'
              size='icon'
              className='h-6 w-6 shrink-0'
            />
          </div>
        ),
      },
      ...(isAdmin
        ? [
            {
              id: 'user_id',
              header: t('User ID'),
              cell: (record: TopupRecord) =>
                record.user_id != null ? (
                  <StatusBadge
                    label={String(record.user_id)}
                    variant='neutral'
                    size='sm'
                    copyText={String(record.user_id)}
                  />
                ) : (
                  <span className='text-muted-foreground'>-</span>
                ),
            },
          ]
        : []),
      {
        id: 'create_time',
        header: t('Created At'),
        cell: (record: TopupRecord) => (
          <span className='text-muted-foreground whitespace-nowrap text-xs sm:text-sm'>
            {formatTimestamp(record.create_time)}
          </span>
        ),
      },
      {
        id: 'payment_method',
        header: t('Payment Method'),
        cell: (record: TopupRecord) => (
          <span className='whitespace-nowrap'>
            {getPaymentMethodName(record.payment_method, t)}
          </span>
        ),
      },
      {
        id: 'amount',
        header: t('Amount'),
        cell: (record: TopupRecord) => (
          <span className='font-medium whitespace-nowrap'>
            {formatCurrencyFromUSD(record.amount, {
              digitsLarge: 2,
              digitsSmall: 2,
              abbreviate: false,
            })}
          </span>
        ),
      },
      {
        id: 'money',
        header: t('Payment'),
        cell: (record: TopupRecord) => (
          <span className='font-semibold whitespace-nowrap text-red-600'>
            {formatNumber(record.money)}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('Status'),
        cell: (record: TopupRecord) => {
          const statusConfig = getStatusConfig(record.status)
          return (
            <StatusBadge
              label={t(statusConfig.label)}
              variant={statusConfig.variant}
              showDot
              copyable={false}
            />
          )
        },
      },
      ...(isAdmin
        ? [
            {
              id: 'actions',
              header: t('Actions'),
              className: 'text-right',
              cellClassName: 'text-right',
              cell: (record: TopupRecord) =>
                record.status === 'pending' ? (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setConfirmTradeNo(record.trade_no)}
                    disabled={completing}
                  >
                    {t('Complete Order')}
                  </Button>
                ) : (
                  <span className='text-muted-foreground'>-</span>
                ),
            },
          ]
        : []),
    ],
    [completing, isAdmin, t]
  )

  const handleConfirmComplete = async () => {
    if (!confirmTradeNo) return
    const success = await handleCompleteOrder(confirmTradeNo)
    if (success) {
      setConfirmTradeNo(null)
    }
  }

  return (
    <>
      <TitledCard
        title={t('Recharge Records')}
        description={t('View your topup transaction records and payment history')}
        icon={<Receipt className='h-4 w-4' />}
        iconTone='info'
        disableHoverEffect
        contentClassName='space-y-3 sm:space-y-4'
      >
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <div className='relative min-w-0 flex-1'>
            <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
            <Input
              placeholder={t('Search by order number...')}
              value={keyword}
              onChange={(event) => handleSearch(event.target.value)}
              className='h-9 pl-10'
            />
          </div>
          <Select
            items={PAGE_SIZE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            value={pageSize.toString()}
            onValueChange={(value) => {
              if (value !== null) {
                handlePageSizeChange(Number.parseInt(value, 10))
              }
            }}
          >
            <SelectTrigger className='h-9 w-full sm:w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }, (_, index) => `row-${index}`).map(
              (key) => (
                <Skeleton key={key} className='h-12 w-full rounded-md' />
              )
            )}
          </div>
        ) : (
          <StaticDataTable
            data={records}
            getRowKey={(record) => record.id}
            emptyContent={
              <div className='text-muted-foreground py-8 text-center'>
                <p className='text-sm font-medium'>
                  {t('No billing records found')}
                </p>
                <p className='mt-1 text-xs'>
                  {keyword
                    ? t('Try adjusting your search')
                    : t('Your transaction history will appear here')}
                </p>
              </div>
            }
            columns={columns}
          />
        )}

        {!loading && total > 0 ? (
          <div className='flex flex-col items-center gap-3 border-t pt-3 sm:flex-row sm:justify-between sm:pt-4'>
            <div className='text-muted-foreground text-xs sm:text-sm'>
              {t('Showing')} {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, total)} {t('of')} {total}
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className='h-8 w-8 p-0'
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <div className='text-muted-foreground flex items-center gap-1 text-sm'>
                <span className='font-medium'>{page}</span>
                <span>/</span>
                <span>{totalPages}</span>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className='h-8 w-8 p-0'
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>
          </div>
        ) : null}
      </TitledCard>

      <AlertDialog
        open={!!confirmTradeNo}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTradeNo(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Complete Order')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Are you sure you want to manually complete this order? The user will be credited with the corresponding quota.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmComplete}
              disabled={completing}
            >
              {completing ? t('Processing...') : t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
