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
import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  getAnnouncementKey,
  type AnnouncementItem,
} from '@/hooks/use-notifications'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'

interface AnnouncementPopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcements: AnnouncementItem[]
}

function AnnouncementDot({ type }: { type?: string }) {
  return (
    <span
      className={cn(
        'mt-1.5 inline-block size-2 shrink-0 rounded-full',
        getAnnouncementColorClass(type)
      )}
    />
  )
}

export function AnnouncementPopup({
  open,
  onOpenChange,
  announcements,
}: AnnouncementPopupProps) {
  const { t } = useTranslation()
  const [visibleAnnouncements, setVisibleAnnouncements] = useState<
    AnnouncementItem[]
  >(announcements)

  // Snapshot the unread list while the dialog is open so marking-as-read
  // does not blank the content before the close animation finishes.
  useEffect(() => {
    if (open && announcements.length > 0) {
      setVisibleAnnouncements(announcements)
    }
  }, [open, announcements])

  if (!open || visibleAnnouncements.length === 0) {
    return null
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className='inline-flex items-center gap-2'>
          <Megaphone className='size-5' />
          {t('System Announcements')}
        </span>
      }
      description={t(
        'Please review the latest announcements. Confirmed items will not pop up again.'
      )}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-xl'
      titleClassName='text-xl font-semibold'
      contentHeight='auto'
      bodyClassName='space-y-0'
      footer={
        <Button
          type='button'
          onClick={() => onOpenChange(false)}
          className='w-full sm:w-auto'
        >
          {t('I understand')}
        </Button>
      }
      footerClassName='sm:justify-end'
    >
      <ScrollArea className='max-h-[min(58vh,520px)] pr-3'>
        <div className='flex flex-col'>
          {visibleAnnouncements.map((item, index) => {
            const key = getAnnouncementKey(item) || `announcement-${index}`
            const publishDate = item.publishDate
              ? new Date(item.publishDate)
              : null
            const absoluteTime =
              publishDate && !Number.isNaN(publishDate.getTime())
                ? formatDateTimeObject(publishDate)
                : ''

            return (
              <div key={key}>
                <div className='py-3'>
                  <div className='flex items-start gap-3'>
                    <AnnouncementDot type={item.type} />
                    <div className='flex min-w-0 flex-1 flex-col gap-2'>
                      <div className='text-sm'>
                        <RichContent breaks content={item.content || ''} />
                      </div>
                      {item.extra ? (
                        <div className='text-muted-foreground text-xs'>
                          <RichContent breaks content={item.extra} />
                        </div>
                      ) : null}
                      {absoluteTime ? (
                        <div className='text-muted-foreground text-xs'>
                          {t('Published:')} {absoluteTime}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                {index < visibleAnnouncements.length - 1 ? <Separator /> : null}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </Dialog>
  )
}
