import { expect, test } from '@playwright/test'

test('verified model image is attached on initial load and survives editing and reload', async ({ page }) => {
  await page.goto('/library')
  await expect(page.locator('.library-seed-banner small')).toContainText(
    /фото снаряжения: \d+ новых|фотографий: \d+/, { timeout: 30000 },
  )
  await page.getByRole('tab', { name: /Снаряжение/ }).click()
  await page.getByLabel('Поиск в библиотеке').fill('Splav Cowl')
  const row = page.locator('.library-entry', { hasText: 'тент' })
  await expect(row.first()).toBeVisible()
  await row.last().click()
  const photo = page.getByRole('img', { name: 'Фото: Фото из каталога снаряжения' })
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate(el => (el as HTMLImageElement).naturalWidth), { timeout: 10000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Редактировать запись', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click()
  await expect(photo).toBeVisible()
  await page.reload()
  await expect(page.locator('.library-seed-banner small')).toContainText('Исходные записи уже добавлены')
  await page.getByRole('tab', { name: /Снаряжение/ }).click()
  await page.getByLabel('Поиск в библиотеке').fill('Splav Cowl')
  // Editing updates the record timestamp, so it sorts before the later LighterPack duplicate.
  await page.locator('.library-entry', { hasText: 'тент' }).first().click()
  await expect(page.getByRole('img', { name: 'Фото: Фото из каталога снаряжения' })).toBeVisible()
})
