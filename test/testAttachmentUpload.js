"use strict";

const env = require("system").env;
const assert = require("assert");
const {FBMessenger} = require("../lib/fbmessenger");

exports.testMessengerProfileAPI = function() {
    assert.isTrue(env["FACEBOOK_PAGE_TOKEN"] != null, "Page token is missing!");
    const bot = new FBMessenger(env["FACEBOOK_PAGE_TOKEN"], false);

    try {
        const id = bot.uploadAttachment("image", "http://orf.at/static/images/site/news/20160728/pokemon_go_datenschutz_pure_r.4699402.jpg");
        assert.isNotNull(id);
        assert.isTrue(id.length > 1);
    } catch (e) {
        assert.fail("Something thrown an error! " + e);
    }
};

if (require.main === module) {
    require("system").exit(require("test").run(exports));
}
