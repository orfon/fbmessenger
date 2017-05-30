exports.testMessengerProfile = require("./testMessengerProfile");

if (require.main === module) {
    require("system").exit(require("test").run(exports));
}
