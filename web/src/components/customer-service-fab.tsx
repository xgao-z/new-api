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
import { Headset } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

export function CustomerServiceFab() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [open, setOpen] = useState(false)

  const enabled = Boolean(status?.customer_service_enabled)
  const qrcode =
    typeof status?.customer_service_qrcode === 'string'
      ? status.customer_service_qrcode.trim()
      : ''

  if (!enabled || !qrcode) {
    return null
  }

  return (
    <>
      <Button
        type='button'
        className={cn(
          'fixed right-6 bottom-6 z-50 h-12 gap-2 rounded-full px-4 shadow-lg',
          'md:h-14 md:px-5'
        )}
        aria-label={t('Customer Support')}
        onClick={() => setOpen(true)}
      >
        <Headset className='size-5 md:size-6' />
        <span className='text-sm font-medium md:text-base'>
          {t('Customer Support')}
        </span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('Customer Support')}
        description={t('Scan the QR code to contact support')}
        contentClassName='max-w-sm'
        contentHeight='auto'
      >
        <div className='flex flex-col items-center gap-3 py-2'>
          <img
            src={qrcode}
            alt={t('Customer Support')}
            className='h-48 w-48 rounded-md border object-contain'
          />
          <p className='text-muted-foreground text-center text-sm'>
            {t('Scan the QR code to contact support')}
          </p>
        </div>
      </Dialog>
    </>
  )
}
