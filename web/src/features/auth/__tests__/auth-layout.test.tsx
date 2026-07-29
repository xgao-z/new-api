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
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'
import { createInstance } from 'i18next'
import type React from 'react'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLImageElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { createRootRoute, createRouter, RouterProvider } =
  await import('@tanstack/react-router')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Confluia brand introduction': 'Confluia brand introduction',
        'Converge. Create. Control.': 'Converge. Create. Control.',
        Logo: 'Logo',
      },
    },
  },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const { AuthLayout } = await import('../auth-layout')

after(() => {
  domWindow.close()
})

describe('AuthLayout', () => {
  test('keeps the form content primary and exposes a visual brand panel on desktop', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const routeTree = createRootRoute({
      component: () => (
        <I18nextProvider i18n={i18n}>
          <AuthLayout>
            <form aria-label='Sign in form'>
              <input aria-label='Username' />
            </form>
          </AuthLayout>
        </I18nextProvider>
      ),
    })
    const router = createRouter({ routeTree })

    await router.load()
    await act(async () => {
      root.render((<RouterProvider router={router} />) as React.ReactElement)
    })

    assert.ok(container.querySelector('form[aria-label="Sign in form"]'))
    assert.equal(
      container.querySelector('aside')?.getAttribute('aria-label'),
      'Confluia brand introduction'
    )
    assert.equal(
      container.textContent?.includes('Converge. Create. Control.'),
      true
    )
    assert.ok(container.querySelector('aside svg'))
    assert.ok(container.querySelector('main .lg\\:border-l'))
    assert.ok(container.querySelector('aside.hidden.lg\\:flex'))

    await act(async () => root.unmount())
    container.remove()
  })
})
