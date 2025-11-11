const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const scrapers = {
  hubspot: {
  url: 'https://www.hubspot.com/careers/jobs',
  search: 'Account Executive',
  jobSelector: 'a[data-testid="job-card-link"]',
  getTitle: el => el.querySelector('h3')?.innerText?.trim() || 'AE Role',
  getLink: el => 'https://www.hubspot.com' + el.getAttribute('href'),
  getId: link => link.match(/\/jobs\/(\d+)/)?.[1] || 'N/A'
}
  salesforce: {
    url: 'https://careers.salesforce.com/en/jobs/',
    search: 'Account Executive',
    jobSelector: '.job-title a',
    getTitle: el => el.innerText.trim(),
    getLink: el => el.href,
    getId: link => link.match(/job\/(\d+)/)?.[1] || 'N/A'
  },
  adobe: {
    url: 'https://careers.adobe.com/us/en/search-results',
    search: 'Account Executive',
    jobSelector: '.search-result',
    getTitle: el => el.querySelector('h2')?.innerText?.trim() || 'AE Role',
    getLink: el => 'https://careers.adobe.com' + el.querySelector('a')?.getAttribute('href'),
    getId: link => link.match(/job\/R(\d+)/)?.[1] || 'N/A'
  }
};

app.post('/scrape', async (req, res) => {
  const { company } = req.body;
  if (!company) return res.status(400).json({ error: 'No company' });

  const key = Object.keys(scrapers).find(k => company.toLowerCase().includes(k));
  if (!key) return res.json({ jobs: [], fallback: true });

  const config = scrapers[key];
  let browser;
  try {
    browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--disable-blink-features=AutomationControlled',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
  ],
  ignoreHTTPSErrors: true,
  defaultViewport: null
});
    const page = await browser.newPage();
    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 15000 });

    const searchInput = await page.$('input[placeholder*="Search"], input[type="search"]');
    if (searchInput) {
      await searchInput.type(config.search);
      await searchInput.press('Enter');
      await page.waitForTimeout(3000);
    }

    const jobs = await page.$$(config.jobSelector);
    const results = [];

    for (let i = 0; i < Math.min(3, jobs.length); i++) {
      const job = jobs[i];
      const title = await page.evaluate(config.getTitle, job);
      const link = await page.evaluate(config.getLink, job);
      const jobId = config.getId(link);
      results.push({ title, jobId, link });
    }

    res.json({ jobs: results });
  } catch (e) {
    res.json({ jobs: [], error: e.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
