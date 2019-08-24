var puppeteer = require('puppeteer')

const pdfGeneratorBull = async (job) => {
  const browser = await puppeteer.launch()

  try {
    const page = await browser.newPage()

    try {
      const logger = new InflightRequests(page)

      await page.goto(job.data.url, { timeout: 45000, waitUntil: 'networkidle2' })
      await page.waitForSelector('#traede-pdf', { timeout: 20000 })
      // remove?

      let inflightRequests = logger.inflightRequests()
      const maxWait = 60000
      const startTime = new Date().getTime()
      let timePassed = 0

      while(inflightRequests.length > 2 && timePassed < maxWait) {
        inflightRequests = logger.inflightRequests()

        timePassed = new Date().getTime() - startTime

        console.log('Inflight length is ' + inflightRequests.length + ' and ' + timePassed + ' has passed')
        console.log(inflightRequests.map(r => r.url()))
      }

      logger.dispose()

      await page.pdf({
        landscape: job.data.meta.landscape === true,
        margin: {
          bottom: 10,
          left: 30,
          right: 30,
          top: 10
        },
        path: job.data.storage_path
      })
    } catch (e) {
      await page.close()

      throw e
    }

    await page.close()
  } catch (e) {
    await browser.close()

    throw e
  }

  await browser.close()
}

module.exports = pdfGeneratorBull

class InflightRequests {
  constructor(page) {
    this._page = page;
    this._requests = new Set();
    this._onStarted = this._onStarted.bind(this);
    this._onFinished = this._onFinished.bind(this);

    this._page.on('request', this._onStarted);
    this._page.on('requestfinished', this._onFinished);
    this._page.on('requestfailed', this._onFinished);
  }

  _onStarted(request) {
    this._requests.add(request);
  }
  _onFinished(request) {
    this._requests.delete(request);
  }

  inflightRequests() {
    const pageUrl = this._page.url()

    // for some reason cloudinary requests will not finished when requested on a local page
    if (pageUrl.match(/\.localhost\:3000/)) {
      return []
    }

    return Array.from(this._requests).filter(r => r.url().match(/cloudinary\.com|traede\.com/));
  }

  dispose() {
    this._page.removeListener('request', this._onStarted);
    this._page.removeListener('requestfinished', this._onFinished);
    this._page.removeListener('requestfailed', this._onFinished);
  }
}
