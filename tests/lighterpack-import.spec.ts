import { test, expect } from '@playwright/test'

test('all four LighterPack lists are imported with source weights and image links, without boilerplate', async ({page}) => {
  await page.goto('/library')
  await expect(page.locator('.library-seed-banner small')).toContainText(/LighterPack:/, {timeout: 30000})
  await page.getByRole('tab', {name:/Снаряжение/}).click()
  await expect.poll(async()=> Number(await page.getByRole('tab',{name:/Снаряжение/}).locator('span').innerText())).toBeGreaterThan(600)
  await page.getByLabel('Поиск в библиотеке').fill('RedFox Lhotse 100')
  const row=page.locator('.library-entry').first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByText('2200', {exact:true})).toBeVisible()
  await expect(page.getByRole('img', {name:'Фото: Фото из LighterPack'})).toBeVisible()
  await expect(page.locator('.library-detail')).not.toContainText('Связанная ссылка LighterPack')
  await page.reload()
  await expect(page.locator('.library-seed-banner small')).toContainText('Исходные записи уже добавлены', {timeout:30000})
  await page.getByRole('tab', {name:/Снаряжение/}).click()
  await expect.poll(async()=> Number(await page.getByRole('tab',{name:/Снаряжение/}).locator('span').innerText())).toBeGreaterThan(600)
})
