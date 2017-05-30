"use strict";

const {FACEBOOK_PAGE_TOKEN, FACEBOOK_PAGE_ID, FACEBOOK_VERIFY_TOKEN} = require("system").env;
const log = require("ringo/logging").getLogger(module.id);
const response = require("ringo/jsgi/response");
const strings = require("ringo/utils/strings");
const dates = require("ringo/utils/dates");
const numbers = require("ringo/utils/numbers");

const {Path} = require("fs");

const {FBMessenger, MultipartStream} = require("../../lib/fbmessenger");
const fbmUtils = require("../../lib/utils");

const {Application} = require("stick");
const app = exports.app = new Application();
app.configure("params", "route");

const bot = new FBMessenger(FACEBOOK_PAGE_TOKEN, false);

if (FACEBOOK_PAGE_TOKEN == null || FACEBOOK_PAGE_ID == null || FACEBOOK_VERIFY_TOKEN == null) {
    log.error("ENV: " + require("system").env);
    throw new Error("Facebook bot config missing! Please set FACEBOOK_PAGE_TOKEN, FACEBOOK_PAGE_ID, and " +
        "FACEBOOK_VERIFY_TOKEN to run this test bot.");
}

app.get("/", function(req) {
    return response.html("<h1>Hello World!</h1>");
});

app.get("/favicon.ico", function(req) {
    return response.redirect("http://orf.at/favicon.ico");
});

// Facebook Messenger callback verification endpoint
log.info("Binding GET /birdie-webhook-callback for messenger ...");
app.get("/birdie-webhook-callback", function(req) {
    if (req.params["hub.verify_token"] === FACEBOOK_VERIFY_TOKEN) {
        log.info("Successful challenge!");
        return response.text(req.params["hub.challenge"]);
    }

    log.error("Failed validation. Make sure the validation tokens match.");
    return response.setStatus(403).text("Failed validation. Make sure the validation tokens match.");
});

// Processing the requests
log.info("Binding POST /birdie-webhook-callback for messenger ...");
app.post("/birdie-webhook-callback", function(req) {
    if (req.postParams !== null && fbmUtils.isMessagingCallback(req.postParams)) {
        try {
            processMessages(fbmUtils.getMessagingForPage(req.postParams, FACEBOOK_PAGE_ID).filter(fbmUtils.isMessage));
            processPostbacks(fbmUtils.getMessagingForPage(req.postParams, FACEBOOK_PAGE_ID).filter(fbmUtils.isPostback));
        } catch (e) {
            log.error("Processing error!", e);
        }
    } else {
        log.error("Invalid request", req.toSource());
    }

    return response.json({
        "timestamp": Date.now()
    }).ok();
});

const processMessages = function(messages) {
    messages.forEach(function(message) {
        processText((message.message.text || "").toLocaleLowerCase(), message);
    });
};

const processPostbacks = function(postbacks) {
    postbacks.forEach(function(postbackMessage) {
        processText((postbackMessage.postback.payload || "").toLocaleLowerCase(), postbackMessage);
    });
};

const processText = function(text, message) {
    if (strings.contains(text, "photo") || strings.contains(text, "image")) {
        bot.sendImageAttachment(message.sender.id, new MultipartStream("photo.jpg", new Path(module.resolve("./fixtures/photo.jpg"))));
    } else if (strings.contains(text, "video")) {
        bot.sendVideoAttachment(message.sender.id, new MultipartStream("video.mp4", new Path(module.resolve("./fixtures/video.mp4"))));
    } else if (strings.contains(text, "audio")) {
        bot.sendAudioAttachment(message.sender.id, new MultipartStream("audio.mp3", new Path(module.resolve("./fixtures/audio.mp3"))));
    } else if (strings.contains(text, "file") || strings.contains(text, "document")) {
        bot.sendFileAttachment(message.sender.id, new MultipartStream("document.pdf", new Path(module.resolve("./fixtures/document.pdf"))));
    } else if (strings.contains(text, "generic")) {
        bot.sendGenericTemplate(message.sender.id, [
            {
                "title":"„Pokemon Go“: Hype sprengt alle Erwartungen",
                "image_url":"http://orf.at/static/images/site/news/20160728/pokemon_go_datenschutz_pure_r.4699402.jpg",
                "subtitle":"Pikachu und Co. erobern erneut die Welt.",
                "buttons":[
                    {
                        "type":"web_url",
                        "url":"http://orf.at/stories/2349101/",
                        "title":"Story lesen \uD83D\uDC53"
                    },
                    {
                        "type":"postback",
                        "title":"Mehr zu Pokemon Go",
                        "payload": "news:stories:pokemongo"
                    }
                ]
            },
            {
                "title":"Alles steht Kopf: Psychologischer Beistand für Kinobesuch",
                "image_url":"http://orf.at/static/images/site/news/20150939/alles_steht_kopf_pixar_film_pure_n.4644298.jpg",
                "subtitle":"„Alles steht Kopf“ spielt im Hirn einer Elfjährigen, bei der nicht nur die Außenwelt aus den Fugen gerät.",
                "buttons":[
                    {
                        "type":"web_url",
                        "url":"http://orf.at/stories/2300732/",
                        "title":"Story lesen \uD83D\uDC53"
                    },
                    {
                        "type":"postback",
                        "title":"Mehr über Pixar",
                        "payload": "news:stories:pixar"
                    }
                ]
            }
        ]);
    } else if (strings.contains(text, "button")) {
        bot.sendButtonTemplate(message.sender.id, "\uD83D\uDC8C Who you gonna vote for?", [
            {
                "type": "postback",
                "title": "Donald Trump",
                "payload": "vote:trump"
            },
            {
                "type": "postback",
                "title": "Hillary Clinton",
                "payload": "vote:clinton"
            }
        ]);

        bot.sendButtonTemplate(message.sender.id, "Need a link to share?", [
            {
                "type": "web_url",
                "title": "dev.ORF.at",
                "url": "http://dev.orf.at"
            }
        ], true);

        bot.sendButtonTemplate(message.sender.id, "Need a link not to share?", [
            {
                "type": "web_url",
                "title": "dev.ORF.at",
                "url": "http://dev.orf.at"
            }
        ], false);

    } else if (strings.contains(text, "advanced")) {
        bot.sendAdvancedTemplate(message.sender.id, {
            "template_type": "airline_checkin",
            "intro_message": "Check-in is available now!",
            "locale": "en_US",
            "pnr_number": "XYZDD",
            "flight_info": [
                {
                    "flight_number": "RG1234",
                    "departure_airport": {
                        "airport_code": "VIE",
                        "city": "Vienna International Airport",
                        "terminal": "T3",
                        "gate": "F16"
                    },
                    "arrival_airport": {
                        "airport_code": "TSR",
                        "city": "Timișoara",
                        "terminal": "T1",
                        "gate": "G1"
                    },
                    "flight_schedule": {
                        "boarding_time": "2016-12-24T10:00",
                        "departure_time": "2016-12-24T11:00",
                        "arrival_time": "2016-12-24T12:10"
                    }
                }
            ],
            "checkin_url": "https:\/\/www.orf.at"
        });
    } else if (strings.contains(text, "rickrolling")) {
        bot.sendAdvancedTemplate(message.sender.id, {
            "template_type": "open_graph",
            "elements":[
                {
                    "url": "https://open.spotify.com/track/7GhIk7Il098yCjg4BQjzvb",
                    "buttons": [
                        {
                            "type": "web_url",
                            "url": "https://en.wikipedia.org/wiki/Rickrolling",
                            "title": "View More"
                        }
                    ]
                }
            ]
        });
    } else if (strings.contains(text, "quick")) {
        if (strings.contains(text, "gif")) {
            bot.sendQuickReplies(message.sender.id, new MultipartStream("animated.gif", new Path(module.resolve("./fixtures/animated.gif"))), [
                {
                    "content_type": "text",
                    "title": "WTF?!",
                    "payload": "quick:wtf:" + Date.now()
                },
                {
                    "content_type": "text",
                    "title": "Cool!",
                    "payload": "quick:cool:" + Date.now()
                }
            ]);
        } else {
            bot.sendQuickReplies(message.sender.id, "1, 2, oder 3?", [
                {
                    "content_type": "text",
                    "title": "1!",
                    "payload": "quick:1:" + Date.now()
                },
                {
                    "content_type": "text",
                    "title": "2!",
                    "payload": "quick:2:" + Date.now()
                },
                {
                    "content_type": "text",
                    "title": "3!",
                    "payload": "quick:3:" + Date.now()
                }
            ]);
        }
    } else if (strings.contains(text, "insights")) {
        const duatc = bot.getDailyUniqueActiveThreads();
        const duc = bot.getDailyUniqueConversations();

        if (duatc.data.length > 0) {
            bot.sendTextMessage(message.sender.id, duatc.data[0].description);
            bot.sendTextMessage(message.sender.id, duatc.data[0].values.map(function(day) {
                return dates.format(dates.parse(day.end_time), "yyyy-MM-dd") + " => " +
                    numbers.format(day.value, "#,###,##0", java.util.Locale.ENGLISH);
            }));
        } else {
            bot.sendTextMessage(message.sender.id, "No daily unique active thread count available, sorry \uD83D\uDE2A");
        }

        if (duc.data.length > 0) {
            bot.sendTextMessage(message.sender.id, duc.data[0].description);
            bot.sendTextMessage(message.sender.id, duc.data[0].values.map(function(day) {
                return dates.format(dates.parse(day.end_time), "yyyy-MM-dd") + " => " +
                    "TURN_ON: " + numbers.format(day.value.TURN_ON, "#,###,##0", java.util.Locale.ENGLISH) + "\n" +
                    "TURN_OFF: " + numbers.format(day.value.TURN_OFF, "#,###,##0", java.util.Locale.ENGLISH) + "\n" +
                    "DELETE: " + numbers.format(day.value.DELETE, "#,###,##0", java.util.Locale.ENGLISH) + "\n" +
                    "REPORT_SPAM: " + numbers.format(day.value.REPORT_SPAM, "#,###,##0", java.util.Locale.ENGLISH) + "\n" +
                    "OTHER: " + numbers.format(day.value.OTHER, "#,###,##0", java.util.Locale.ENGLISH);
            }));
        } else {
            bot.sendTextMessage(message.sender.id, "No daily unique conversation count available, sorry \uD83D\uDE2A");
        }
    } else if (strings.contains(text, "code")) {
        const url = bot.getMessengerCode();
        if (url !== null) {
            bot.sendImageAttachment(message.sender.id, url);
        } else {
            bot.sendTextMessage(message.sender.id, "Could not generate the code, sorry \uD83D\uDE2A");
        }
    } else if (strings.contains(text, "get_started")) {
        bot.sendTextMessage(message.sender.id, "Welcome to the birdie test bot! \uD83D\uDC26");
    } else {
        bot.sendTextMessage(message.sender.id, "Heyo, current time is: " + new Date());
    }
};
