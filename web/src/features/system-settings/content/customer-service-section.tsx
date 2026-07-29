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
import { useEffect, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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

import {
  SettingsForm,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const customerServiceSchema = z.object({
  qrcode: z.string().url().optional().or(z.literal('')),
})

type CustomerServiceFormValues = z.infer<typeof customerServiceSchema>

type CustomerServiceSectionProps = {
  enabled: boolean
  qrcode: string
}

export function CustomerServiceSection(props: CustomerServiceSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [isEnabled, setIsEnabled] = useState(props.enabled)

  const form = useForm<CustomerServiceFormValues>({
    resolver: zodResolver(
      customerServiceSchema
    ) as unknown as Resolver<CustomerServiceFormValues>,
    defaultValues: {
      qrcode: props.qrcode || '',
    },
  })

  useEffect(() => {
    setIsEnabled(props.enabled)
  }, [props.enabled])

  useEffect(() => {
    form.reset({
      qrcode: props.qrcode || '',
    })
  }, [form, props.qrcode])

  const { isDirty, isSubmitting } = form.formState

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.customer_service_enabled',
        value: checked,
      })
      setIsEnabled(checked)
    } catch {
      toast.error(t('Failed to update setting'))
    }
  }

  const onSubmit = async (values: CustomerServiceFormValues) => {
    const nextQrcode = values.qrcode?.trim() || ''
    if (nextQrcode === (props.qrcode || '')) {
      toast.info(t('No changes to save'))
      return
    }

    await updateOption.mutateAsync({
      key: 'console_setting.customer_service_qrcode',
      value: nextQrcode,
    })
    form.reset({ qrcode: nextQrcode })
  }

  return (
    <SettingsSection title={t('Customer Service')}>
      <div className='space-y-6'>
        <SettingsSwitchField
          checked={isEnabled}
          onCheckedChange={handleToggleEnabled}
          disabled={updateOption.isPending}
          label={t('Enable customer support button')}
          description={t(
            'Show a floating customer support button on the site'
          )}
        />

        <Form {...form}>
          <SettingsForm
            onSubmit={form.handleSubmit(onSubmit)}
            autoComplete='off'
          >
            <SettingsPageFormActions
              onSave={form.handleSubmit(onSubmit)}
              isSaving={updateOption.isPending || isSubmitting}
              isSaveDisabled={!isDirty}
              saveLabel='Save customer service settings'
            />

            <FormField
              control={form.control}
              name='qrcode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Customer Service QR Code URL')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('https://example.com/support-qr.png')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Image URL of the customer service QR code. The floating button is shown only when enabled and this URL is set.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsForm>
        </Form>
      </div>
    </SettingsSection>
  )
}
