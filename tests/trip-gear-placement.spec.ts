import { expect, test } from '@playwright/test'

test('placement is per hike, not a global note on the gear card', async ({page}) => {
  await page.goto('/library')
  await expect(page.locator('.library-seed-banner small')).toContainText(/LighterPack:/, {timeout:30000})

  async function newTrip(title: string) {
    await page.goto('/')
    await page.getByRole('button', {name:'Новый поход'}).click()
    const form=page.getByRole('dialog')
    await form.getByPlaceholder('Например, Карельские озёра').fill(title)
    await form.getByRole('button', {name:'Создать поход'}).click()
    await expect(page.getByRole('heading',{name:title})).toBeVisible()
    const path=new URL(page.url()).pathname
    await page.getByRole('link',{name:'Снаряжение похода'}).click()
    await expect(page.getByRole('heading',{name:'Снаряжение похода'})).toBeVisible()
    return path
  }

  async function addGear(placement:string) {
    await page.getByRole('button',{name:'Добавить предмет'}).click()
    const form=page.getByRole('dialog',{name:'Снаряжение конкретного похода'})
    await form.getByLabel('Поиск в библиотеке').fill('JetBoil MicroMo')
    await expect(form.locator('select').first().locator('option')).not.toHaveCount(1)
    await form.locator('select').first().selectOption({index:1})
    await form.getByLabel('Место размещения').fill(placement)
    await form.getByRole('button',{name:'Сохранить'}).click()
    await expect(page.getByText('Место: '+placement)).toBeVisible()
  }

  const original=await newTrip('Поход с рюкзаком')
  await addGear('верхний клапан')
  await newTrip('Поход налегке')
  await addGear('внешний карман')
  await page.goto(original+'/gear')
  await expect(page.getByText('Место: верхний клапан')).toBeVisible()
  await expect(page.getByText('Место: внешний карман')).toHaveCount(0)
})
