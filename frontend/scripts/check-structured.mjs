import { chromium } from 'playwright'

const BASE = 'http://localhost:5174'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

// Login
await page.goto(`${BASE}/login`)
await page.fill('input[type="email"]', 'test-responsive@finanzasia.com')
await page.fill('input[type="password"]', 'Test1234!')
await page.click('button[type="submit"]')
await page.waitForTimeout(1500)

// C001 (HTML artículo con structured)
await page.goto(`${BASE}/contenido/C001`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/shots/structured-C001.png', fullPage: true })

// C016 (herramientas con links raíz)
await page.goto(`${BASE}/contenido/C016`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/shots/structured-C016.png', fullPage: true })

// C099 (buscar uno con links en paragraphs - tiene 11 en scraped, debería tener algunos en paragraphs)
await page.goto(`${BASE}/contenido/C099`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/shots/structured-C099.png', fullPage: true })

// C030 (blog con video)
await page.goto(`${BASE}/contenido/C030`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/shots/structured-C030.png', fullPage: true })

// C080 (también video)
await page.goto(`${BASE}/contenido/C080`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/shots/structured-C080.png', fullPage: true })

await browser.close()
console.log('Screenshots guardados.')
