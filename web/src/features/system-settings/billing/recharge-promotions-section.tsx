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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useFieldArray, useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatTimestampForInput, formatTimestampToDate } from '@/lib/format'
import { getCurrencyLabel } from '@/lib/currency'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { safeNumberFieldProps } from '../utils/numeric-field'
import {
  createRechargePromotion,
  deleteRechargePromotion,
  getRechargePromotions,
  updateRechargePromotion,
  type RechargePromotion,
  type RechargePromotionInput,
} from './recharge-promotions-api'

type RechargePromotionTierFormValues = {
  min_payment_amount: number
  model_name: string
  gift_amount: number
  expire_days: number
}

type RechargePromotionFormValues = {
  name: string
  enabled: boolean
  priority: number
  start_time: string
  end_time: string
  tiers: RechargePromotionTierFormValues[]
}

const RECHARGE_PROMOTIONS_QUERY_KEY = ['recharge-promotions'] as const
const RECHARGE_PROMOTION_FORM_ID = 'recharge-promotion-form'

const createEmptyTier = (): RechargePromotionTierFormValues => ({
  min_payment_amount: 1,
  model_name: '',
  gift_amount: 1,
  expire_days: 30,
})

const createEmptyPromotion = (): RechargePromotionFormValues => ({
  name: '',
  enabled: true,
  priority: 0,
  start_time: '',
  end_time: '',
  tiers: [createEmptyTier()],
})

function createRechargePromotionSchema(t: TFunction) {
  const tierSchema = z.object({
    min_payment_amount: z
      .number()
      .finite(t('Minimum payment amount must be a number'))
      .positive(t('Minimum payment amount must be greater than 0')),
    model_name: z.string().trim().min(1, t('Model name is required')),
    gift_amount: z
      .number()
      .finite(t('Gift amount must be a number'))
      .positive(t('Gift amount must be greater than 0')),
    expire_days: z
      .number()
      .int(t('Expiry must be a whole number of days'))
      .min(1, t('Expiry must be at least 1 day'))
      .max(3650, t('Expiry cannot exceed 3650 days')),
  })

  return z
    .object({
      name: z.string().trim().min(1, t('Promotion name is required')),
      enabled: z.boolean(),
      priority: z.number().int(t('Priority must be a whole number')),
      start_time: z.string(),
      end_time: z.string(),
      tiers: z.array(tierSchema).min(1, t('Add at least one reward tier')),
    })
    .superRefine((values, ctx) => {
      if (
        values.start_time &&
        values.end_time &&
        new Date(values.end_time).getTime() <=
          new Date(values.start_time).getTime()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['end_time'],
          message: t('End time must be after start time'),
        })
      }
    })
}

function timestampToFormValue(timestamp: number) {
  return timestamp > 0 ? formatTimestampForInput(timestamp) : ''
}

function promotionToFormValues(
  promotion: RechargePromotion
): RechargePromotionFormValues {
  return {
    name: promotion.name,
    enabled: promotion.enabled,
    priority: promotion.priority,
    start_time: timestampToFormValue(promotion.start_time),
    end_time: timestampToFormValue(promotion.end_time),
    tiers: promotion.tiers.map((tier) => ({
      min_payment_amount: tier.min_payment_amount,
      model_name: tier.model_name,
      gift_amount: tier.gift_amount,
      expire_days: tier.expire_days,
    })),
  }
}

function formValueToTimestamp(value: string) {
  return value ? Math.floor(new Date(value).getTime() / 1000) : 0
}

function formValuesToPromotion(
  values: RechargePromotionFormValues
): RechargePromotionInput {
  return {
    name: values.name.trim(),
    enabled: values.enabled,
    priority: values.priority,
    start_time: formValueToTimestamp(values.start_time),
    end_time: formValueToTimestamp(values.end_time),
    tiers: values.tiers.map((tier) => ({
      min_payment_amount: tier.min_payment_amount,
      model_name: tier.model_name.trim(),
      gift_amount: tier.gift_amount,
      expire_days: tier.expire_days,
    })),
  }
}

type RechargePromotionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  promotion: RechargePromotion | null
}

function RechargePromotionDialog({
  open,
  onOpenChange,
  promotion,
}: RechargePromotionDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currencyLabel = getCurrencyLabel()
  const schema = React.useMemo(() => createRechargePromotionSchema(t), [t])
  const form = useForm<RechargePromotionFormValues>({
    resolver: zodResolver(schema) as Resolver<RechargePromotionFormValues>,
    defaultValues: createEmptyPromotion(),
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'tiers',
  })
  const createMutation = useMutation({
    mutationFn: createRechargePromotion,
    onSuccess: (response) => {
      if (response.success) {
        toast.success(t('Recharge promotion created successfully'))
        queryClient.invalidateQueries({
          queryKey: RECHARGE_PROMOTIONS_QUERY_KEY,
        })
      }
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      promotion,
    }: {
      id: number
      promotion: RechargePromotionInput
    }) => updateRechargePromotion(id, promotion),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(t('Recharge promotion updated successfully'))
        queryClient.invalidateQueries({
          queryKey: RECHARGE_PROMOTIONS_QUERY_KEY,
        })
      }
    },
  })
  const isEditing = promotion !== null
  const isPending = createMutation.isPending || updateMutation.isPending
  let submitLabel = t('Create Promotion')
  if (isPending) {
    submitLabel = t('Saving...')
  } else if (isEditing) {
    submitLabel = t('Save Changes')
  }

  React.useEffect(() => {
    if (!open) return
    form.reset(
      promotion ? promotionToFormValues(promotion) : createEmptyPromotion()
    )
  }, [form, open, promotion])

  const onSubmit = async (values: RechargePromotionFormValues) => {
    const payload = formValuesToPromotion(values)
    const response = isEditing
      ? await updateMutation.mutateAsync({
          id: promotion.id,
          promotion: payload,
        })
      : await createMutation.mutateAsync(payload)

    if (response.success) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEditing ? t('Edit Recharge Promotion') : t('Add Recharge Promotion')
      }
      description={
        isEditing
          ? t('Update the campaign timing and qualifying reward tiers.')
          : t('Configure a time-bounded reward for qualifying recharges.')
      }
      contentClassName='sm:max-w-4xl'
      bodyClassName='space-y-5'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form={RECHARGE_PROMOTION_FORM_ID}
            disabled={isPending}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <SettingsForm
          id={RECHARGE_PROMOTION_FORM_ID}
          className='gap-y-5'
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enabled')}</FormLabel>
                  <FormDescription>
                    {t('Apply this campaign to new qualifying recharges.')}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <div className='grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Promotion Name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('e.g. Summer model credits')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='priority'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Priority')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step='1'
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Higher campaigns are selected first.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='start_time'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Start Time')}</FormLabel>
                  <FormControl>
                    <Input type='datetime-local' {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('Leave empty to start immediately.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='end_time'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('End Time')}</FormLabel>
                  <FormControl>
                    <Input type='datetime-local' {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('Leave empty to continue indefinitely.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div>
                <h4 className='text-sm font-medium'>{t('Reward Tiers')}</h4>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'The highest tier at or below the recharge amount is granted.'
                  )}
                </p>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => append(createEmptyTier())}
              >
                <Plus />
                {t('Add Tier')}
              </Button>
            </div>

            <div className='space-y-3'>
              {fields.map((tier, index) => (
                <div
                  key={tier.id}
                  className='bg-muted/20 rounded-lg border p-3'
                >
                  <div className='mb-3 flex items-center justify-between gap-3'>
                    <span className='text-sm font-medium'>
                      {t('Reward Tier {{number}}', { number: index + 1 })}
                    </span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            disabled={fields.length === 1}
                            onClick={() => remove(index)}
                            aria-label={t('Remove tier')}
                          >
                            <Trash2 />
                          </Button>
                        }
                      />
                      <TooltipContent>{t('Remove tier')}</TooltipContent>
                    </Tooltip>
                  </div>

                  <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                    <FormField
                      control={form.control}
                      name={`tiers.${index}.min_payment_amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Minimum Payment')}</FormLabel>
                          <FormControl>
                            <Input
                              type='number'
                              min='0.01'
                              step='0.01'
                              {...safeNumberFieldProps(field)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`tiers.${index}.model_name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Model Name')}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t('e.g. gpt-4o-mini')}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`tiers.${index}.gift_amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('Gift Amount ({{currency}})', {
                              currency: currencyLabel,
                            })}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type='number'
                              min='0.01'
                              step='0.01'
                              {...safeNumberFieldProps(field)}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'The amount users receive in the current display currency.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`tiers.${index}.expire_days`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Expiry Days')}</FormLabel>
                          <FormControl>
                            <Input
                              type='number'
                              min='1'
                              max='3650'
                              step='1'
                              {...safeNumberFieldProps(field)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SettingsForm>
      </Form>
    </Dialog>
  )
}

function getPromotionSchedule(promotion: RechargePromotion, t: TFunction) {
  if (promotion.start_time > 0 && promotion.end_time > 0) {
    return t('{{start}} to {{end}}', {
      start: formatTimestampToDate(promotion.start_time),
      end: formatTimestampToDate(promotion.end_time),
    })
  }
  if (promotion.start_time > 0) {
    return t('From {{time}}', {
      time: formatTimestampToDate(promotion.start_time),
    })
  }
  if (promotion.end_time > 0) {
    return t('Until {{time}}', {
      time: formatTimestampToDate(promotion.end_time),
    })
  }
  return t('Always active')
}

export function RechargePromotionsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingPromotion, setEditingPromotion] =
    React.useState<RechargePromotion | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<RechargePromotion | null>(null)
  const { data: promotions = [], isLoading } = useQuery({
    queryKey: RECHARGE_PROMOTIONS_QUERY_KEY,
    queryFn: async () => {
      const response = await getRechargePromotions()
      return response.data ?? []
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteRechargePromotion,
    onSuccess: (response) => {
      if (response.success) {
        toast.success(t('Recharge promotion deleted successfully'))
        queryClient.invalidateQueries({
          queryKey: RECHARGE_PROMOTIONS_QUERY_KEY,
        })
        setDeleteTarget(null)
      }
    },
  })

  const openCreateDialog = () => {
    setEditingPromotion(null)
    setDialogOpen(true)
  }

  const openEditDialog = (promotion: RechargePromotion) => {
    setEditingPromotion(promotion)
    setDialogOpen(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditingPromotion(null)
    }
  }

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteMutation.mutateAsync(deleteTarget.id)
    }
  }

  return (
    <TooltipProvider>
      <SettingsSection title={t('Recharge Promotions')}>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-muted-foreground text-sm'>
            {t('Manage model-specific quota rewards for qualifying recharges.')}
          </p>
          <Button size='sm' onClick={openCreateDialog}>
            <Plus />
            {t('Add Promotion')}
          </Button>
        </div>

        {isLoading ? (
          <div className='text-muted-foreground py-8 text-center text-sm'>
            {t('Loading...')}
          </div>
        ) : (
          <StaticDataTable
            data={promotions}
            getRowKey={(promotion) => promotion.id}
            getRowClassName={(promotion) =>
              promotion.enabled ? undefined : 'opacity-60'
            }
            emptyClassName='text-sm'
            emptyContent={t('No recharge promotions configured yet.')}
            columns={[
              {
                id: 'name',
                header: t('Name'),
                cellClassName: 'font-medium',
                cell: (promotion) => promotion.name,
              },
              {
                id: 'status',
                header: t('Status'),
                cell: (promotion) => (
                  <StatusBadge
                    label={promotion.enabled ? t('Enabled') : t('Disabled')}
                    variant={promotion.enabled ? 'success' : 'neutral'}
                    copyable={false}
                  />
                ),
              },
              {
                id: 'priority',
                header: t('Priority'),
                cell: (promotion) => promotion.priority,
              },
              {
                id: 'schedule',
                header: t('Schedule'),
                cellClassName: 'max-w-64',
                cell: (promotion) => getPromotionSchedule(promotion, t),
              },
              {
                id: 'tiers',
                header: t('Reward Tiers'),
                cell: (promotion) =>
                  t('{{count}} tiers', { count: promotion.tiers.length }),
              },
              {
                id: 'actions',
                header: t('Actions'),
                className: 'text-right',
                cellClassName: 'text-right',
                cell: (promotion) => (
                  <StaticRowActions
                    editLabel={t('Edit')}
                    deleteLabel={t('Delete')}
                    menuLabel={t('Open menu')}
                    onEdit={() => openEditDialog(promotion)}
                    onDelete={() => setDeleteTarget(promotion)}
                  />
                ),
              },
            ]}
          />
        )}

        <RechargePromotionDialog
          open={dialogOpen}
          onOpenChange={handleDialogOpenChange}
          promotion={editingPromotion}
        />

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={t('Delete Recharge Promotion')}
          desc={t(
            'Delete "{{name}}"? This does not revoke quota rewards that have already been issued.',
            { name: deleteTarget?.name ?? '' }
          )}
          confirmText={t('Delete')}
          destructive
          handleConfirm={handleDelete}
          isLoading={deleteMutation.isPending}
        />
      </SettingsSection>
    </TooltipProvider>
  )
}
