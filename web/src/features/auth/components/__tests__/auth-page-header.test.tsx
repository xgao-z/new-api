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
import { LogIn } from 'lucide-react'
import type React from 'react'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
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
const { AuthPageHeader } = await import('../auth-page-header')

after(() => {
  domWindow.close()
})

describe('AuthPageHeader', () => {
  test('renders title, optional description, and icon container', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <AuthPageHeader
          icon={LogIn}
          title='Sign in'
          description={<span data-testid='desc'>Welcome back</span>}
        /> as React.ReactElement
      )
    })

    const heading = container.querySelector('h1')
    assert.ok(heading)
    assert.equal(heading?.textContent, 'Sign in')

    const description = container.querySelector('[data-testid="desc"]')
    assert.ok(description)
    assert.equal(description?.textContent, 'Welcome back')

    const iconWrapper = container.querySelector('.rounded-xl.ring-1')
    assert.ok(iconWrapper)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  test('omits description when not provided', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <AuthPageHeader icon={LogIn} title='Create an account' /> as React.ReactElement
      )
    })

    assert.equal(container.querySelector('h1')?.textContent, 'Create an account')
    assert.equal(container.querySelectorAll('p').length, 0)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
