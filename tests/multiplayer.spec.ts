import { expect, test, type Page } from '@playwright/test'

async function createRoom(page: Page, seconds: '0' | '15') {
  await page.goto('/')
  await page.getByLabel('Il tuo nickname').fill('Ada')
  await page.getByRole('button', { name: 'Crea partita' }).click()
  await page.getByLabel('Tempo per turno').selectOption(seconds)
  await page.getByRole('button', { name: 'Crea lobby' }).click()
  const code = page.locator('.code-panel strong')
  await expect(code).toHaveText(/^[A-Z2-9]{6}$/)
  return code.innerText()
}

async function joinRoom(page: Page, code: string) {
  await page.goto('/')
  await page.getByLabel('Il tuo nickname').fill('Luigi')
  await page.getByRole('button', { name: 'Unisciti a partita' }).click()
  await page.getByLabel('Codice lobby').fill(code)
  await page.getByRole('button', { name: 'Entra nella lobby' }).click()
  await expect(page.getByRole('region', { name: 'Tu' })).toContainText('Luigi')
}

test('due sessioni anonime sincronizzano partita, nickname, riconnessione e rivincita', async ({ browser }) => {
  const host = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  let a = await host.newPage()
  let b = await guest.newPage()
  const code = await createRoom(a, '0')
  await joinRoom(b, code)

  await expect(a.getByRole('region', { name: 'Avversario' })).toContainText('Luigi')
  await expect(b.getByRole('region', { name: 'Avversario' })).toContainText('Ada')
  for (const page of [a, b]) {
    const aligned = await page.locator('.match').evaluate(match => {
      const [opponent, board, local] = [...match.children].slice(0, 3).map(child => child.getBoundingClientRect())
      return opponent.bottom <= board.top && board.bottom <= local.top &&
        document.documentElement.scrollWidth <= innerWidth &&
        Math.abs(board.left - (innerWidth - board.width) / 2) < 1
    })
    expect(aligned).toBe(true)
  }

  await a.getByRole('button', { name: 'Seleziona C1' }).click()
  await a.getByRole('button', { name: 'Sposta in C2' }).click()
  await expect(b.getByRole('button', { name: 'Seleziona D1' })).toBeVisible()
  await a.getByRole('button', { name: 'Modifica nickname' }).click()
  await a.getByLabel('Nuovo nickname').fill('Àda & 🦊')
  await a.getByLabel('Nuovo nickname').press('Enter')
  await expect(b.getByRole('region', { name: 'Avversario' })).toContainText('Àda & 🦊')
  await expect(b.getByRole('button', { name: 'Seleziona D1' })).toBeVisible()

  await a.close()
  await expect(b.getByRole('region', { name: 'Avversario' })).toContainText('Disconnesso', { timeout: 35_000 })
  a = await host.newPage()
  await a.goto('/')
  await expect(a.getByRole('region', { name: 'Tu' })).toContainText('Àda & 🦊')
  await expect(b.locator('.connected')).toBeVisible()

  b.once('dialog', dialog => dialog.accept())
  await b.getByRole('button', { name: 'Abbandona partita' }).click()
  await expect(a.getByRole('heading', { name: 'Hai vinto!' })).toBeVisible()
  await a.getByRole('button', { name: 'Torna al menu' }).click()
  await expect(a.getByLabel('Il tuo nickname')).toBeVisible()
  await expect(b.getByLabel('Il tuo nickname')).toBeVisible()

  const secondCode = await createRoom(a, '15')
  await joinRoom(b, secondCode)
  await expect(a.locator('.player.active time')).toBeVisible()
  await expect(b.locator('.player.active time')).toBeVisible()
  await Promise.all([a.close(), b.close()])

  // The cron-specific SQL test separately proves expiry before any sync RPC.
  await new Promise(resolve => setTimeout(resolve, 17_000))
  a = await host.newPage()
  b = await guest.newPage()
  await Promise.all([a.goto('/'), b.goto('/')])
  await expect(a.getByRole('heading', { name: 'Hai perso!' })).toBeVisible()
  await expect(b.getByRole('heading', { name: 'Hai vinto!' })).toBeVisible()
  await a.getByRole('button', { name: 'Gioca di nuovo' }).click()
  await b.getByRole('button', { name: 'Accetta rivincita' }).click()
  await expect(b.getByRole('button', { name: 'Seleziona C1' })).toBeVisible()
  await expect(a.locator('.header-detail b')).toHaveText(secondCode)
  await expect(a.getByRole('region', { name: 'Tu' })).toContainText('Ada')
  await expect(b.getByRole('region', { name: 'Tu' })).toContainText('Luigi')
})
