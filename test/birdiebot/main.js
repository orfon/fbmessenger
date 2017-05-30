"use strict";

const fs = require("fs");
const strings = require("ringo/utils/strings");

// logging
const log = require("ringo/logging").getLogger(module.id);

// the HTTP server itself
const httpServer = require("httpserver");
let server = null;

const stop = exports.stop = function() {
    if (server !== null) {
        server.stop();
    }
};

const start = exports.start = function() {
    log.info("Starting application birdie");
    server = httpServer.build()
        .serveApplication("/", module.resolve("./routes"))
        .http({
            "host": "0.0.0.0",
            "port": 8080
        });

    server.start();
};

if (require.main === module) {
    start();
}
