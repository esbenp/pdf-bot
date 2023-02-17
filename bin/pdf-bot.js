var debug = require("debug")("pdf:cli");
var fs = require("fs");
var path = require("path");
var pjson = require("../package.json");
var program = require("commander");
const uuid = require("uuid");
const createConfig = require("../src/config");
var createApi = require("../src/api");
var Queue = require("bull");
const pdfGenerator = require("../src/pdfGenerator");

function start() {
  if (!program.config) {
    if (fs.existsSync(path.join(process.cwd(), "pdf-bot.config.js"))) {
      program.config = "pdf-bot.config.js";
    } else {
      throw new Error("You need to supply a config file");
    }
  }

  var configPath = path.join(process.cwd(), program.config);

  if (!fs.existsSync(configPath)) {
    throw new Error("No config file was found at " + configPath);
  }

  const configuration = createConfig(configPath);
  debug("Creating CLI using config file %s", configPath);

  const storagePath = configuration.storagePath;

  if (!fs.existsSync(storagePath)) {
    throw new Error(
      "Whoops! Looks like your storage folder does not exist. You should run pdf-bot install."
    );
  }

  if (!fs.existsSync(path.join(storagePath, "pdf"))) {
    throw new Error(
      "There is no pdf folder in the storage folder. Create it: storage/pdf"
    );
  }

  // CREATE QUEUES
  var inboundQueue = new Queue("inbound");
  var pdfQueue = new Queue("pdf-generation");
  var storageQueue = new Queue("storage");
  var webhookQueue = new Queue("webhook");

  // CREATE API
  var apiOptions = configuration.api;
  createApi(inboundQueue, {
    port: apiOptions.port,
    token: apiOptions.token,
  }).listen(apiOptions.port, function () {
    console.log("Listening to port %d", apiOptions.port);
  });

  const createErrorLog = (text) => {
    return (err) => console.log(`${text}\n${err.toString()}\n${err.stack}`);
  };
  const createFailLog = (text) => {
    return (job, err) => {
      console.error(`${text}\n${err.toString()}\n${err.stack}`);
    };
  };

  const parseUrl = (job) => {
    return `${job.data.url.replace(
      /^(.+)\/print\?access_token\=[A-Za-z0-9-_\.]+(.+)/,
      "$1"
    )}`;
  };

  inboundQueue.on("error", createErrorLog("Error in processing inbound queue"));
  inboundQueue.on("failed", createFailLog("Failed processing inbound"));
  inboundQueue.on("completed", (job) => {
    console.log("Inbound complete", parseUrl(job));
  });

  inboundQueue.process((job) => {
    const id = uuid();

    return pdfQueue.add(
      {
        id: id,
        url: job.data.url,
        meta: job.data.meta,
        storage_path: path.join(storagePath, "pdf", id + ".pdf"),
        cache_path: path.join(storagePath, "cache"),
        priority: job.data.priority,
      },
      {
        priority: job.data.priority,
        attempts: 5,
      }
    );
  });

  pdfQueue.on("error", createErrorLog("Error in pdf queue"));
  pdfQueue.on("failed", createFailLog("Failed pdf"));
  /*pdfQueue.process(
    parseInt(program.concurrency || 1),
    path.join(process.cwd(), "/src/pdfGenerator.js")
  );*/
  pdfQueue.process((job) => {
    return pdfGenerator(job);
  });
  pdfQueue.on("completed", (job, response) => {
    var log = `Process complete ${parseUrl(job)}`;

    if (job.data.priority) {
      log = "PRIORITY: " + job.id + " " + log;
    }

    console.log(log);

    storageQueue.add(
      {
        ...job.data,
        storage: configuration.storage,
        timings: response.timings,
      },
      {
        priority: job.data.priority,
        attempts: 5,
      }
    );
  });

  storageQueue.on("error", createErrorLog("Error in storage queue"));
  storageQueue.on("failed", createFailLog("Failed storage"));
  storageQueue.process(path.join(process.cwd(), "src/store.js"));
  storageQueue.on("completed", (job, response) => {
    var log = `Storage complete ${parseUrl(job)}`;

    if (job.data.priority) {
      log = "PRIORITY: " + log;
    }

    console.log(log);

    webhookQueue.add(
      {
        ...job.data,
        storage_responses: response,
        webhook: configuration.webhook,
      },
      {
        priority: job.data.priority,
        attempts: 5,
      }
    );
  });

  webhookQueue.on("error", createErrorLog("Error in webhook queue"));
  webhookQueue.on("failed", createFailLog("Failed webhook"));
  webhookQueue.process(path.join(process.cwd(), "src/webhook.js"));
  webhookQueue.on("completed", (job, response) => {
    var log = `Webhook complete ${parseUrl(job)}`;

    if (job.data.priority) {
      log = "PRIORITY: " + log;
    }

    console.log(log);
  });
}

program
  .version(pjson.version)
  .option("-c, --config <path>", "Path to configuration file")
  .option("--concurrency <concurrency>", "How many concurrent PDF processors?");

program.command("start").action(start);

program.command("clean").action(() => {
  var tenMinutesAgo = 60 * 10;

  var inboundQueue = new Queue("inbound");
  var pdfQueue = new Queue("pdf-generation");
  var storageQueue = new Queue("storage");
  var webhookQueue = new Queue("webhook");

  return inboundQueue
    .clean(tenMinutesAgo, "completed")
    .then(pdfQueue.clean(tenMinutesAgo, "completed"))
    .then(storageQueue.clean(tenMinutesAgo, "completed"))
    .then(webhookQueue.clean(tenMinutesAgo, "completed"))
    .then(() => {
      console.log("DONE");
      process.exit(0);
    });
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
