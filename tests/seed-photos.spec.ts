import { expect, test } from '@playwright/test'

test('Excel catalog seeds once without replacing user records', async ({ page }) => {
  await page.goto('/library')
  await expect(page.locator('.library-seed-banner small')).toContainText(
    /Загружено из двух Excel|Исходные записи уже добавлены/, { timeout: 30000 },
  )
  await expect(page.getByRole('tab', { name: /Продукты/ })).toContainText('43')
  await page.getByRole('tab', { name: /Снаряжение/ }).click()
  await expect(page.getByRole('tab', { name: /Снаряжение/ })).toContainText('113')
  await page.getByRole('button', { name: /рюкзак 48 л/ }).first().click()
  await expect(page.getByText('1215', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.library-seed-banner small')).toContainText('Исходные записи уже добавлены')
  await page.getByRole('tab', { name: /Снаряжение/ }).click()
  await expect(page.getByRole('tab', { name: /Снаряжение/ })).toContainText('113')
  await page.getByRole('button', { name: /Сверить и добавить недостающее/ }).click()
  await expect(page.locator('.library-seed-banner small')).toContainText('добавлено 0', { timeout: 30000 })
})
test('photograph survives page reload and record edits', async ({ page }) => {
  await page.goto('/library')
  await expect(page.locator('.library-seed-banner small')).toContainText(/Загружено из двух Excel|Исходные записи уже добавлены/, { timeout: 30000 })
  await page.getByRole('tab', { name: /Снаряжение/ }).click()
  await page.getByRole('button', { name: /рюкзак 48 л/ }).first().click()
  // Small valid PNG, converted to a compressed WebP/PNG thumbnail in the browser.
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGMM27GMgRTARJLqUQ2jGoaUBgBn4wHUMdljYgAAAABJRU5ErkJggg==', 'base64')
  await page.getByLabel('Выбрать фотографии').setInputFiles({ name:'test-gear.png', mimeType:'image/png', buffer:pixel })
  await expect(page.getByRole('img', { name:'Фото: test-gear.png' })).toBeVisible()
  await page.getByRole('button', { name:'Редактировать запись', exact:true }).click()
  await page.getByRole('dialog').getByRole('button', { name:'Сохранить' }).click()
  await page.reload()
  await page.getByRole('tab', { name:/Снаряжение/ }).click()
  await page.getByRole('button', { name:/рюкзак 48 л/ }).first().click()
  await expect(page.getByRole('img', { name:'Фото: test-gear.png' })).toBeVisible()
})
