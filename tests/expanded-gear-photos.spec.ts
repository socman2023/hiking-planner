import { expect, test } from '@playwright/test'

test('extended model photos render and keep visual attribution', async ({page})=>{
  await page.goto('/library')
  await expect(page.locator('.library-seed-banner small')).toContainText(/фото снаряжения: \d+ новых|фотографий: \d+/,{timeout:30000})
  await page.getByRole('tab',{name:/Снаряжение/}).click()
  await page.getByLabel('Поиск в библиотеке').fill('Osprey Exos 48')
  await page.locator('.library-entry').last().click()
  const photo=page.getByRole('img',{name:'Фото: Фото из каталога снаряжения'})
  await expect(photo).toBeVisible()
  await expect.poll(()=>photo.evaluate(el=>(el as HTMLImageElement).naturalWidth),{timeout:10000}).toBeGreaterThan(0)
})
test('unverified item illustration explicitly states it is not the same model',async({page})=>{
  await page.goto('/library')
  await expect(page.locator('.library-seed-banner small')).toContainText(/фото снаряжения: \d+ новых|фотографий: \d+/,{timeout:30000})
  await page.getByRole('tab',{name:/Снаряжение/}).click()
  await page.getByLabel('Поиск в библиотеке').fill('Osprey Ultralight Raincover M')
  await page.locator('.library-entry').last().click()
  await expect(page.getByText(/Типовое фото: точная модель/)).toBeVisible()
})
