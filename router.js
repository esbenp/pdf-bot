const Arena = require("bull-arena");

// Mandatory import of queue library.
var Bull = require("bull");

const express = require("express");
const router = express.Router();

const arena = Arena({
  // All queue libraries used must be explicitly imported and included.
  Bull,

  queues: [
    {
      name: "inbound",
      hostId: "pdf",
    },
    {
      name: "pdf-generation",
      hostId: "pdf",
    },
    {
      name: "storage",
      hostId: "pdf",
    },
    {
      name: "webhook",
      hostId: "pdf",
    },
  ],
});
router.use("/", arena);
