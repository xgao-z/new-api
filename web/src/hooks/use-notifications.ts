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
import { useEffect, useMemo, useState } from 'react'

import { useStatus } from '@/hooks/use-status'
import { getNotice } from '@/lib/api'
import { useNotificationStore } from '@/stores/notification-store'

export interface AnnouncementItem {
  id?: number | string
  type?: string
  content?: string
  extra?: string
  publishDate?: string | Date
  title?: string
  link?: string
}

function hashString(input: string): string {
  let hash = 0
  if (!input) return '0'

  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }

  return hash.toString(36)
}

/**
 * Generate a unique key for an announcement.
 * Prefer backend id, fall back to a content hash so edits register.
 */
export function getAnnouncementKey(item: AnnouncementItem): string {
  if (!item) return ''

  if (item.id !== undefined && item.id !== null) {
    return `id:${item.id}`
  }

  const fingerprint = JSON.stringify({
    publishDate: (item.publishDate as string) || '',
    content: (item.content || '').trim(),
    extra: (item.extra || '').trim(),
    type: item.type || '',
    title: (item.title || '').trim(),
    link: (item.link || '').trim(),
  })
  return `hash:${hashString(fingerprint)}`
}

function isAnnouncementPublished(item: AnnouncementItem, now = Date.now()): boolean {
  if (!item.publishDate) return true
  const publishAt = new Date(item.publishDate).getTime()
  if (Number.isNaN(publishAt)) return true
  return publishAt <= now
}

/**
 * Hook to manage notifications (Notice + Announcements)
 * Provides unread counts, read status management, and auto popup state.
 */
export function useNotifications() {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [hasAutoOpenedPopup, setHasAutoOpenedPopup] = useState(false)
  const [activeTab, setActiveTab] = useState<'notice' | 'announcements'>(
    'notice'
  )

  // Fetch Notice from API
  const {
    data: noticeResponse,
    isLoading: noticeLoading,
    refetch: refetchNotice,
  } = useQuery({
    queryKey: ['notice'],
    queryFn: getNotice,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch Announcements from status
  const { status, loading: statusLoading } = useStatus()
  const announcementsEnabled = status?.announcements_enabled ?? false
  const announcements: AnnouncementItem[] = useMemo(() => {
    if (!announcementsEnabled) return []
    return ((status?.announcements || []) as AnnouncementItem[])
      .filter((item) => Boolean((item.content || '').trim()))
      .filter((item) => isAnnouncementPublished(item))
      .slice(0, 20)
  }, [announcementsEnabled, status?.announcements])

  // Notification store
  const {
    lastReadNotice,
    markNoticeRead,
    markAnnouncementsRead,
    isAnnouncementRead,
  } = useNotificationStore()

  // Extract notice content
  const noticeContent = noticeResponse?.success
    ? (noticeResponse.data || '').trim()
    : ''

  const unreadAnnouncements = useMemo(
    () =>
      announcements.filter((item) => {
        const key = getAnnouncementKey(item)
        return key !== '' && !isAnnouncementRead(key)
      }),
    [announcements, isAnnouncementRead]
  )

  // Calculate unread counts
  const unreadCounts = useMemo(() => {
    const noticeUnread =
      noticeContent && noticeContent !== lastReadNotice ? 1 : 0

    return {
      notice: noticeUnread,
      announcements: unreadAnnouncements.length,
      total: noticeUnread + unreadAnnouncements.length,
    }
  }, [noticeContent, lastReadNotice, unreadAnnouncements.length])

  const markAnnouncementsAsRead = (items: AnnouncementItem[] = announcements) => {
    if (items.length === 0) return
    const keys = items
      .map((item) => getAnnouncementKey(item))
      .filter((key) => key !== '')
    if (keys.length > 0) {
      markAnnouncementsRead(keys)
    }
  }

  // Auto-open unread announcement popup once per page load when data is ready.
  useEffect(() => {
    if (hasAutoOpenedPopup || noticeLoading || statusLoading || popoverOpen) {
      return
    }
    if (unreadAnnouncements.length === 0) {
      return
    }
    setPopupOpen(true)
    setHasAutoOpenedPopup(true)
  }, [
    hasAutoOpenedPopup,
    noticeLoading,
    statusLoading,
    popoverOpen,
    unreadAnnouncements.length,
  ])

  // Handle popover open
  const handleOpenPopover = (tab?: 'notice' | 'announcements') => {
    const nextTab = tab || activeTab

    // Mark currently visible content as read when opening the notification center
    if (noticeContent) {
      markNoticeRead(noticeContent)
    }
    if (nextTab === 'announcements') {
      markAnnouncementsAsRead()
    }

    setActiveTab(nextTab)
    setPopoverOpen(true)
    setPopupOpen(false)
  }

  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      handleOpenPopover(activeTab)
      return
    }

    setPopoverOpen(false)
  }

  // Handle tab change - mark announcements as read when switching to that tab
  const handleTabChange = (tab: 'notice' | 'announcements') => {
    setActiveTab(tab)

    if (tab === 'announcements') {
      markAnnouncementsAsRead()
    }
  }

  const dismissAnnouncementPopup = () => {
    markAnnouncementsAsRead(unreadAnnouncements)
    setPopupOpen(false)
  }

  const handlePopupOpenChange = (open: boolean) => {
    if (open) {
      setPopupOpen(true)
      return
    }
    dismissAnnouncementPopup()
  }

  return {
    // Data
    notice: noticeContent,
    announcements,
    unreadAnnouncements,
    loading: noticeLoading || statusLoading,

    // Unread counts
    unreadCount: unreadCounts.total,
    unreadNoticeCount: unreadCounts.notice,
    unreadAnnouncementsCount: unreadCounts.announcements,

    // Popover state
    popoverOpen,
    setPopoverOpen: handlePopoverOpenChange,
    activeTab,
    setActiveTab: handleTabChange,

    // Popup state
    popupOpen,
    setPopupOpen: handlePopupOpenChange,
    dismissAnnouncementPopup,

    // Actions
    openPopover: handleOpenPopover,
    closePopover: () => setPopoverOpen(false),
    refetchNotice,
  }
}
