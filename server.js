const express = require('express');
const chromium = require('chrome-aws-lambda');
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
};

app.post('/scrape', async (req, res) => {
  const { company } = req.body;
  if (!company) return res.status(400).json({ error: 'No company' });

  const key = Object.keys(scrapers).find(k => company.toLowerCase().includes(k));
  if (!key) return res.json({ jobs: [], fallback: true });

  const config = scrapers[key];
  let browser;
  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });

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
    console.error(e);
    res.json({ jobs: [], error: e.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
  }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
