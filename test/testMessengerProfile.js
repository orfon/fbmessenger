"use strict";

const env = require("system").env;
const assert = require("assert");
const {FBMessenger} = require("../lib/fbmessenger");

exports.testMessengerProfileAPI = function() {
    assert.isTrue(env["FACEBOOK_PAGE_TOKEN"] != null, "Page token is missing!");
    const bot = new FBMessenger(env["FACEBOOK_PAGE_TOKEN"], false);

    try {
        bot.setGetStartedButton("TESTPAYLOAD_GET_STARTED");
        bot.setGreetingText([
            {
                "locale": "default",
                "text": "Hello World!"
            },
            {
                "locale": "de_DE",
                "text": "Hallo Welt!"
            }
        ]);
        bot.setPersistentMenu([
            {
                "locale": "default",
                "composer_input_disabled": true,
                "call_to_actions": [
                    {
                        "title": "Simple Test Actions",
                        "type": "nested",
                        "call_to_actions": [
                            {
                                "type": "postback",
                                "title": "Photo",
                                "payload": "photo"
                            },
                            {
                                "type": "postback",
                                "title": "Video",
                                "payload": "video"
                            },
                            {
                                "type": "postback",
                                "title": "Audio",
                                "payload": "audio"
                            },
                            {
                                "type": "postback",
                                "title": "File",
                                "payload": "file"
                            },
                            {
                                "type": "postback",
                                "title": "Generic",
                                "payload": "generic"
                            }
                        ]
                    },
                    {
                        "title": "Advanced Test Actions",
                        "type": "nested",
                        "call_to_actions": [
                            {
                                "type": "postback",
                                "title": "Button Template",
                                "payload": "button"
                            },
                            {
                                "type": "postback",
                                "title": "Advanced Template",
                                "payload": "advanced"
                            },
                            {
                                "type": "postback",
                                "title": "Open Graph Spotify",
                                "payload": "rickrolling"
                            },
                            {
                                "type": "postback",
                                "title": "Quick Reply Simple",
                                "payload": "quick"
                            },
                            {
                                "type": "postback",
                                "title": "Quick Reply GIF",
                                "payload": "quick gif"
                            }
                        ]
                    },
                    {
                        "title": "Other stuff",
                        "type": "nested",
                        "call_to_actions": [
                            {
                                "type": "postback",
                                "title": "Messenger Code",
                                "payload": "code"
                            },
                            {
                                "type": "postback",
                                "title": "Insights",
                                "payload": "insights"
                            }
                        ]
                    }
                ]
            },
            {
                "locale": "de_DE",
                "composer_input_disabled": false,
                "call_to_actions": [
                    {
                        "title": "Einfache Testaktionen",
                        "type": "nested",
                        "call_to_actions": [
                            {
                                "type": "postback",
                                "title": "Foto",
                                "payload": "photo"
                            },
                            {
                                "type": "postback",
                                "title": "Video",
                                "payload": "video"
                            },
                            {
                                "type": "postback",
                                "title": "Audio",
                                "payload": "audio"
                            },
                            {
                                "type": "postback",
                                "title": "Datei",
                                "payload": "file"
                            },
                            {
                                "type": "postback",
                                "title": "Generisches Vorlage",
                                "payload": "generic"
                            }
                        ]
                    },
                    {
                        "title": "Erweiterte Testaktionen",
                        "type": "nested",
                        "call_to_actions": [
                            {
                                "type": "postback",
                                "title": "Button Vorlage",
                                "payload": "button"
                            },
                            {
                                "type": "postback",
                                "title": "Komplexe Vorlage",
                                "payload": "advanced"
                            },
                            {
                                "type": "postback",
                                "title": "Open Graph Spotify",
                                "payload": "rickrolling"
                            },
                            {
                                "type": "postback",
                                "title": "Quick Reply Einfach",
                                "payload": "quick"
                            },
                            {
                                "type": "postback",
                                "title": "Quick Reply mit GIF",
                                "payload": "quick gif"
                            }
                        ]
                    },
                    {
                        "title": "Sonstige Sachen",
                        "type": "nested",
                        "call_to_actions": [
                            {
                                "type": "postback",
                                "title": "Messenger Code",
                                "payload": "code"
                            },
                            {
                                "type": "postback",
                                "title": "Analysen",
                                "payload": "insights"
                            }
                        ]
                    }
                ]
            }
        ]);
    } catch (e) {
        assert.fail("Something thrown an error! " + e);
    }
};

exports.testTargetAudience = function() {
    assert.isTrue(env["FACEBOOK_PAGE_TOKEN"] != null, "Page token is missing!");
    const bot = new FBMessenger(env["FACEBOOK_PAGE_TOKEN"], false);

    try {
        bot.setAudienceType("custom", {
            "whitelist": ["DE", "AT", "CH"]
        })
    } catch (e) {
        assert.fail("Something thrown an error! " + e);
    }
};

exports.testWhitelistDomains = function() {
    assert.isTrue(env["FACEBOOK_PAGE_TOKEN"] != null, "Page token is missing!");
    const bot = new FBMessenger(env["FACEBOOK_PAGE_TOKEN"], false);

    try {
        bot.whitelistDomains(["https://dev.orf.at", "https://sport.orf.at"]);
    } catch (e) {
        assert.fail("Something thrown an error! " + e);
    }
};

exports.testDeleteProfileFields = function() {
    assert.isTrue(env["FACEBOOK_PAGE_TOKEN"] != null, "Page token is missing!");
    const bot = new FBMessenger(env["FACEBOOK_PAGE_TOKEN"], false);

    try {
        bot.whitelistDomains(["https://dev.orf.at", "https://sport.orf.at"]);
        const response = bot.deleteProfileFields(["whitelisted_domains"]);
        assert.equal(response.result, "success");
    } catch (e) {
        assert.fail("Something thrown an error! " + e);
    }
};

if (require.main === module) {
    require("system").exit(require("test").run(exports));
}
