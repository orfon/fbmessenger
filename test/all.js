exports.testMessengerProfile = require("./testMessengerProfile");
exports.testAttachmentUpload = require("./testAttachmentUpload");

if (require.main === module) {
    require("system").exit(require("test").run(exports));
}
