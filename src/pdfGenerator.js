var puppeteer = require("puppeteer");

const getBrowser = async (job) => {
  return puppeteer.launch({
    userDataDir: job.data.cache_path,
  });
};

const pdfGenerator = async (job) => {
  let timings = {};

  const browser = await getBrowser(job);

  try {
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      if (interceptedRequest.url().includes("__webpack_hmr"))
        interceptedRequest.abort();
      else interceptedRequest.continue();
    });

    const logger = new InflightRequests(page);

    try {
      await page.goto(job.data.url, {
        timeout: 45000,
        waitUntil: "networkidle0",
      });
      await page.waitForSelector("#traede-pdf", { timeout: 20000 });
      // remove?

      let inflightRequests = logger.inflightRequests();
      const maxWait = 10000;
      const startTime = new Date().getTime();
      let timePassed = 0;
      let lastLogTime = startTime;

      while (inflightRequests.length > 0 && timePassed < maxWait) {
        inflightRequests = logger.inflightRequests();

        timePassed = new Date().getTime() - startTime;

        const onlyOneCloudinary =
          inflightRequests.length === 1 &&
          inflightRequests[0].match(/cloudinary\.com/);
        if (onlyOneCloudinary) {
          //break;
        }

        const timePassedSinceLastLog = new Date().getTime() - lastLogTime;

        if (timePassedSinceLastLog > 1000) {
          console.log(
            "Inflight length is " +
              inflightRequests.length +
              " and " +
              timePassed +
              " has passed"
          );
          console.log(inflightRequests);

          lastLogTime = new Date().getTime();
        }
      }

      timings = logger.timings();
      logger.dispose();

      const margin = {
        bottom: 40,
        left: 50,
        right: 50,
        top: 40,
      };

      const pdfOptions = {
        format: "A4",
        landscape: job.data.meta.landscape === true,
        margin: margin,
        path: job.data.storage_path,
      };

      if (job.data.meta.height) {
        pdfOptions.height = job.data.meta.height;
      }
      if (job.data.meta.width) {
        pdfOptions.width = job.data.meta.width;
      }
      if (job.data.meta.margin) {
        pdfOptions.margin = job.data.meta.margin;
      }
      if (pdfOptions.height && pdfOptions.width) {
        delete pdfOptions.format;
      }

      const footerContents = [];

      if (job.data.meta.raw_footer_contents) {
        footerContents.push(job.data.meta.raw_footer_contents);
      }

      if (job.data.meta.page_numbers === true) {
        footerContents.push(
          '<div style="text-align:right; font-size:12px; padding-right:20px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
        );
      }

      if (footerContents.length > 0) {
        const footerTemplate =
          '<div class="page-footer" style="width:100%">' +
          footerContents.join("") +
          "</div>";

        pdfOptions.margin.bottom = 25 + footerContents.length * 25;
        pdfOptions.displayHeaderFooter = true;
        // Puppeteer will by default display title and date here
        pdfOptions.headerTemplate = "<div></div>";
        pdfOptions.footerTemplate = footerTemplate;
      }

      await page.pdf(pdfOptions);
    } catch (e) {
      await page.close();

      throw e;
    }

    await page.close();
  } catch (e) {
    await browser.close();

    throw e;
  }

  await browser.close();

  for (let [k, v] of Object.entries(timings)) {
    delete timings[k].start;
    delete timings[k].end;
  }

  return {
    timings,
  };
};

module.exports = pdfGenerator;

class InflightRequests {
  constructor(page) {
    this._page = page;
    this._requests = new Set();
    this._onStarted = this._onStarted.bind(this);
    this._onFinished = this._onFinished.bind(this);

    this._page.on("request", this._onStarted);
    this._page.on("requestfinished", this._onFinished);
    this._page.on("requestfailed", this._onFinished);

    this._timings = {};
  }

  _onStarted(request) {
    this._timings[this._parseUrl(request.url())] = {
      start: Date.now(),
      end: null,
      time: null,
      cache: null,
    };

    this._requests.add(request.url());
  }

  _onFinished(request) {
    const response = request.response();

    const parsedUrl = this._parseUrl(request.url());

    if (response) {
      this._timings[parsedUrl].end = Date.now();
      this._timings[parsedUrl].time =
        this._timings[parsedUrl].end - this._timings[parsedUrl].start;
      this._timings[parsedUrl].cache = request.response().fromCache();
    }

    this._requests.delete(request.url());
  }

  _parseUrl = (url) => {
    return url.replace(/(\?)access_token=[^&]*(?:&|$)|&key=[^&]*/gim, "$1");
  };

  inflightRequests() {
    const pageUrl = this._page.url();

    // for some reason cloudinary requests will not finished when requested on a local page
    /*
    if (pageUrl.match(/\.localhost\:3000/)) {
      return []
    }
*/
    return Array.from(this._requests).filter((r) =>
      // fonts.gstatic.com is google fonts for campaigns
      r.match(/cloudinary\.com|traede\.com|fonts\.gstatic\.com/)
    );
  }

  timings() {
    return this._timings;
  }

  dispose() {
    this._page.removeListener("request", this._onStarted);
    this._page.removeListener("requestfinished", this._onFinished);
    this._page.removeListener("requestfailed", this._onFinished);
  }
}
