import {test,expect} from '@playwright/test';

test('Vite mock boots without injected host, supports scenarios and administration',async({page})=>{
  const errors:string[]=[];
  const remote:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(/VueRenderError|PromiseReject|Mock command not implemented/.test(message.text()))errors.push(message.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1:4183/'))remote.push(request.url());});
  await page.goto('/?lang=en-US');
  await expect(page.locator('.popomo-terminal .qr')).toBeVisible();
  await page.locator('[data-mock-panel] summary').click();
  const originalQR=await page.locator('.qr').innerHTML();
  await page.getByLabel('扫码目标 device_id').fill('invalid');
  await page.getByRole('button',{name:'保存扫码目标'}).click();
  await expect(page.locator('[data-mock-status]')).toContainText('必须是');
  await page.getByLabel('扫码目标 device_id').fill('401');
  await page.getByLabel('扫码目标 shop_id').fill('146');
  await page.getByRole('button',{name:'保存扫码目标'}).click();
  await expect(page.locator('[data-mock-status]')).toContainText('扫码目标已保存');
  await expect(page.locator('.qr')).toBeVisible();
  await expect.poll(()=>page.locator('.qr').innerHTML()).not.toBe(originalQR);
  expect(await page.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('get_setting_options'))).toMatchObject({device_id:'401'});
  await page.getByLabel('Mock scenario').selectOption('printing');
  await expect(page.locator('.progress-number')).toContainText('46');
  await expect.poll(()=>page.locator('.order-preview-image').first().evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
  await page.getByLabel('Mock scenario').selectOption('offline');
  await expect(page.locator('.qr')).toHaveCount(0);
  await page.getByLabel('Mock scenario').selectOption('ready');
  await expect(page.locator('.qr')).toBeVisible();
  await page.getByRole('button',{name:'模拟新订单'}).click();
  await expect(page.locator('.arrival-notice')).toBeVisible();
  await page.locator('[data-mock-panel] summary').click();
  await page.keyboard.press('F8');
  for(const digit of '168168')await page.locator(`[data-skbtn="${digit}"]`).click();
  await page.locator('[data-skbtn="{confirm}"]').click();
  await expect(page.locator('.admin-shell')).toBeVisible();
  for(const tab of ['Payment Settings','Print Settings','Inventory','System']) {
    await page.locator('.admin-nav').getByText(tab,{exact:true}).click();
    await expect(page.locator('.admin-content')).toBeVisible();
    if(tab==='Payment Settings'||tab==='Print Settings') {
      await page.locator('.admin-content').getByRole('button',{name:'Save',exact:true}).first().click();
      await expect(page.locator('[data-mock-status]')).toContainText('模拟设置已保存');
    }
  }
  // Use the real account form, virtual keyboard and Save button.
  const account=page.locator('.system-module-card').filter({has:page.locator('.account-form')});
  await account.getByPlaceholder('Select or enter H5 URL').click();
  await page.locator('.keyboard-input').fill('https://example.invalid/changed');
  await page.locator('.keyboard-input').press('Enter');
  await account.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('[data-mock-status]')).toContainText('已保存到当前浏览器');
  expect(await page.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('get_machine_info'))).toMatchObject({h5_base_url:'https://example.invalid/changed'});
  await page.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('update_slot_count_all',{count:3}));
  await page.locator('.admin-header button').click();
  await expect(page.locator('.qr')).toBeVisible();
  await page.keyboard.press('F8');
  for(const digit of '168168')await page.locator(`[data-skbtn="${digit}"]`).click();
  await page.locator('[data-skbtn="{confirm}"]').click();
  await expect(account.getByPlaceholder('Select or enter H5 URL')).toHaveValue('https://example.invalid/changed');
  await page.reload();
  await expect(page.locator('.qr')).toBeVisible();
  expect(await page.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('get_machine_info'))).toMatchObject({h5_base_url:'https://example.invalid/changed'});
  expect(await page.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('get_stock_list'))).toEqual(expect.arrayContaining([expect.objectContaining({count:3})]));
  const another=await page.context().newPage();
  await another.goto('/?lang=en-US');
  await expect(another.locator('.qr')).toBeVisible();
  expect(await another.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('get_machine_info'))).toMatchObject({device_id:'401',shop_id:'146',h5_base_url:'https://example.invalid/changed'});
  await another.close();
  // Reset removes only mock state, preserving unrelated browser settings.
  await page.evaluate(()=>localStorage.setItem('unrelated-setting','keep'));
  await page.locator('[data-mock-panel] summary').click();
  await page.getByRole('button',{name:'恢复默认模拟设置'}).click();
  await expect.poll(()=>page.evaluate(async()=>(window as any).__TAURI_INTERNALS__?.invoke('get_machine_info'))).toMatchObject({device_id:'900001',shop_id:'900001',h5_base_url:'https://example.invalid/mock'});
  expect(await page.evaluate(()=>localStorage.getItem('unrelated-setting'))).toBe('keep');
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test('mock inputs, scenario and added orders survive refresh without a save click',async({page})=>{
  await page.goto('/?lang=en-US');
  await expect(page.locator('.qr')).toBeVisible();
  await page.locator('[data-mock-panel] summary').click();
  await page.getByLabel('扫码目标 device_id').fill('401');
  await page.getByLabel('扫码目标 shop_id').fill('146');
  await page.getByLabel('Mock scenario').selectOption('printing');
  await page.getByRole('button',{name:'模拟新订单'}).click();
  await page.reload();
  await expect(page.locator('.progress-number')).toContainText('46');
  await page.locator('[data-mock-panel] summary').click();
  await expect(page.getByLabel('扫码目标 device_id')).toHaveValue('401');
  await expect(page.getByLabel('扫码目标 shop_id')).toHaveValue('146');
  await expect(page.getByLabel('Mock scenario')).toHaveValue('printing');
  expect(await page.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('get_order_list'))).toEqual(expect.arrayContaining([expect.objectContaining({trade_no:'MOCK-ORDER-11'})]));
  await page.getByRole('button',{name:'模拟新订单'}).click();
  const another=await page.context().newPage();
  await another.goto('/?lang=en-US');
  await expect(another.locator('.progress-number')).toContainText('46');
  expect(await another.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('get_order_list'))).toEqual(expect.arrayContaining([expect.objectContaining({trade_no:'MOCK-ORDER-11'}),expect.objectContaining({trade_no:'MOCK-ORDER-12'})]));
  await another.close();
  await page.getByRole('button',{name:'恢复默认模拟设置'}).click();
  await expect(page.locator('.qr')).toBeVisible();
  await expect(page.locator('.progress-number')).toHaveCount(0);
  expect(await page.evaluate(async()=>(window as any).__TAURI_INTERNALS__.invoke('get_order_list'))).toEqual([]);
});
