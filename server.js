const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { company } = req.body;
  if (!company) return res.status(400).json({ error: 'No company' });

  const clean = company.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseUrl = `https://${clean}.com`;
  const careersUrl = `${baseUrl}/careers`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const response = await page.goto(careersUrl, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => null);
    if (!response || response.status() >= 400) {
      return res.json({ jobs: [], fallback: true });
    }

    // Try to search
    const searchInput = await page.$('input[placeholder*="search" i], input[type="search"], input[name="q" i]');
    if (searchInput) {
      await searchInput.type('Account Executive OR AE');
      await searchInput.press('Enter');
      await page.waitForTimeout(2500);
    }

    // Universal job link selectors
    const jobLinks = await page.$$eval('a', links => links
      .filter(a => {
        const href = a.getAttribute('href') || '';
        const text = a.innerText || '';
        return (href.includes('/job') || href.includes('/position') || href.includes('/opening') || href.includes('/careers/')) &&
               (text.toLowerCase().includes('account executive') || text.toLowerCase().includes('ae'));
      })
      .slice(0, 3)
      .map(a => ({
        title: a.innerText.trim(),
        link: a.href.startsWith('http') ? a.href : new URL(a.getAttribute('href'), a.baseURI).href
      }))
    );

    const results = jobLinks.map(job => ({
      title: job.title,
      jobId: job.link.match(/\/(\d{4,})[^\/]*$/)?.[1] || 'N/A',
      link: job.link
    }));

    res.json({ jobs: results.length > 0 ? results : [], fallback: results.length === 0 });

  } catch (e) {
    console.error(e);
    res.json({ jobs: [], fallback: true });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Universal AE Scraper live on ${PORT}`));
