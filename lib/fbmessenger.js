"use strict";

/**
 * @fileoverview The Facebook Messenger platform bot client for RingoJS. It provides a convenient interface to
 * the HTTP-based Graph API. It supports webhook callbacks, the Send API, the Thread Settings API,
 * and the User Profile API. Advanced account linking is not supported at the moment.
 *
 * @see <a href="https://developers.facebook.com/docs/messenger-platform">Messenger Platform Documentation</a>
 * @see <a href="https://developers.facebook.com/docs/graph-api">Facebook Graph API</a>
 */

const NOTIFICATION_DEFAULT = "REGULAR";

const objects = require("ringo/utils/objects");
const strings = require("ringo/utils/strings");

let {Stream, TextStream} = require("io");
const {Path, openRaw} = require("fs");

const {request, TextPart, BinaryPart} = require("ringo/httpclient");

/**
 * Error to be thrown for Graph API exceptions and errors. The original response
 * with all error details is stored in the `response` property.
 * @type {GraphApiError}
 */
const GraphApiError = exports.GraphApiError = function GraphApiError(message, response) {
    /**
     * The error message.
     */
    this.message = message;

    /**
     * Original response JSON returned by the Graph API.
     */
    this.response = response;

    /**
     * @ignore
     */
    this.name = "GraphApiError";
};

/**
 * @ignore
 */
GraphApiError.prototype = Object.create(Error.prototype);

/**
 * Object to wrap file uploads to the Graph API via `multipart/form-data`.
 * The input can be a `Stream` for binary reading or a `Path` to the file.
 * @param {string} name the name of the file
 * @param {io.Stream|fs.Path} source input binary stream or a path to the file
 * @constructor
 */
const MultipartStream = exports.MultipartStream = function(name, source) {
    if (name == null || (!(source instanceof Stream) && !(source instanceof Path))) {
        throw new Error("Invalid parameters for MultipartStream.");
    }

    /**
     * Name of the file
     */
    this.name = name;

    /**
     * Input source or path
     * @type {io.Stream|fs.Path}
     */
    this.stream = (source instanceof Stream ? source : openRaw(source, "r"));
};

/**
 * A Facebook Messenger bot client. It manages the HTTPS-based communication with the API endpoint
 * and handles potential error. The supported Graph API level is v2.9.
 * @type {FBMessenger}
 * @param {string} pageAccessToken the bot's access token to a Facebook page
 * @param {boolean} batched batch requests into a single Graph API call until `.sendBatch()` is called.
 *                          Note: `MultipartStream` attachments can't be batched and are immediately sent.
 */
const FBMessenger = exports.FBMessenger = function FBMessenger(pageAccessToken, batched) {
    const FB_API_BASE_URL = "https://graph.facebook.com/";
    const FB_API_VERSION  = "v2.9/";
    const FB_API_URL = FB_API_BASE_URL + FB_API_VERSION;
    const TOKEN = pageAccessToken;

    const BATCH_MODE = batched === true;
    const batchRequestBuffer = [];

    const processExchange = function(exchange) {
        let resp = null;
        try {
            resp = JSON.parse(exchange.content);
        } catch (e) {
            throw new Error("Could not parse JSON response by Messenger Send API: " + e);
        }

        if(exchange.status !== 200 || resp.hasOwnProperty("error")) {
            if (resp !== null && resp.hasOwnProperty("error")) {
                throw new GraphApiError("Messenger Send API error code " + resp.error.code + "; " +
                    resp.error.type + "; " + resp.error.message, resp);
            } else {
                throw new GraphApiError("Messenger Send API returned unknown error.", resp);
            }
        }

        if (resp !== null) {
            return resp;
        } else {
            throw new GraphApiError("Messenger Send API returned unknown error.", resp);
        }
    };

    /**
     * @ignore
     */
    this._request = function(graphEndpoint, payload, queryString, method, payloadTag) {
        if (payload != null && !payload instanceof Object) {
            throw new Error("Invalid payload for Messenger Send API: " + typeof obj);
        }

        if (graphEndpoint === "me/messages") {
            if (!payload.hasOwnProperty("recipient")) {
                throw new Error("Invalid payload for Messenger Send API: recipient missing!");
            }

            if (!payload.hasOwnProperty("message") && !payload.hasOwnProperty("sender_action")) {
                throw new Error("Invalid payload for Messenger Send API: message or sender_action missing!");
            }

            if (payloadTag != null) {
                if (typeof payloadTag !== "string") {
                    throw new Error("Invalid payload tag!");
                }
                payload.tag = payloadTag;
            }
        } else if (typeof payloadTag === "string") {
            throw new Error("Payload tag cannot be specified for non-message calls!");
        }

        if (BATCH_MODE) {
            batchRequestBuffer.push({
                method: method ? method : "POST",
                relative_url: FB_API_VERSION + graphEndpoint,
                body: payload
            });
        } else {
            return processExchange(request({
                url: FB_API_URL + graphEndpoint + "?access_token=" + TOKEN + (typeof queryString === "string" ? "&" + queryString : ""),
                method: method ? method : "POST",
                data: payload ? JSON.stringify(payload) : "",
                headers: {
                    "Cache-Control": "no-cache, no-store",
                    "Content-Type": "application/json; charset=utf-8"
                }
            }));
        }
    };

    /**
     * @ignore
     */
    this._requestMultipart = function(graphEndpoint, payload, payloadTag) {
        if (payload === null || !payload instanceof Object) {
            throw new Error("Invalid payload for Messenger Send API: " + typeof payload);
        }

        if (!payload.hasOwnProperty("recipient")) {
            throw new Error("Invalid payload for Messenger Send API: recipient missing!");
        }

        if (typeof payloadTag === "string") {
            if (typeof payloadTag !== "string") {
                throw new Error("Invalid payload tag!");
            }
            payload.tag = payloadTag;
        }

        const multipartPayload = {};
        for (let name in payload) {
            if (payload.hasOwnProperty(name) && payload[name] instanceof MultipartStream) {
                let multiStream = payload[name];
                if (multiStream.stream instanceof TextStream) {
                    multipartPayload[name] = new TextPart(multiStream.stream, "utf-8", multiStream.name)
                } else {
                    multipartPayload[name] = new BinaryPart(multiStream.stream, multiStream.name);
                }
            } else if (payload[name] instanceof Object) {
                multipartPayload[name] = new TextPart(JSON.stringify(payload[name]), "utf-8");
            } else {
                multipartPayload[name] = new TextPart(String(payload[name]), "utf-8");
            }
        }

        try {
            return processExchange(request({
                url: FB_API_URL + graphEndpoint + "?access_token=" + TOKEN,
                method: "POST",
                data: multipartPayload,
                headers: {
                    "Cache-Control": "no-cache, no-store",
                    "Content-Type": "multipart/form-data"
                }
            }));
        } finally {
            for (let name in payload) {
                if (payload.hasOwnProperty(name) && payload[name] instanceof MultipartStream && !payload[name].stream.closed()) {
                    payload[name].stream.close();
                }
            }
        }
    };

    /**
     * @ignore
     */
    this.sendAttachment = function (type, id, attachment, reusable, quickReplies, notificationType, tag) {
        let data = {
            "recipient": {
                "id": id
            },
            "message": {
                "attachment": {
                    "type": type,
                    "payload": {}
                }
            },
            "notification_type": notificationType || NOTIFICATION_DEFAULT
        };

        if (Array.isArray(quickReplies)) {
            data.message.quick_replies = quickReplies;
        }

        // Stores the attachment on Facebook's servers
        if (typeof reusable === "boolean") {
            data.message.attachment.payload.is_reusable = reusable === true;
        }

        if (typeof attachment === "string" && strings.isUrl(attachment)) {
            data.message.attachment.payload.url = attachment;
            return this._request("me/messages", data, null, "POST", tag);
        } else if (attachment instanceof MultipartStream) {
            data.filedata = attachment;
            return this._requestMultipart("me/messages", data, tag);
        } else {
            throw new Error("FBMessenger attachment must be an URL or MultipartStream!");
        }
    };

    /**
     * @ignore
     */
    this._batchRequest = function() {
        if (!BATCH_MODE) {
            throw new Error("FBMessenger instance not configured in batch mode!");
        }

        const fbRequestObj = batchRequestBuffer.map(function(request) {
            if (request.body) {
                if (request.method === "GET" || request.method === "DELETE") {
                    delete(request.body);
                } else {
                    const bodyParts = [];
                    Object.keys(request.body).forEach(function(key) {
                        bodyParts.push(encodeURIComponent(key) + "=" + encodeURIComponent(typeof request.body[key] === "object" ? JSON.stringify(request.body[key]) : request.body[key]));
                    });
                    request.body = bodyParts.join("&");
                }
            }

            return request;
        });

        // empty the buffer, length is writable
        batchRequestBuffer.length = 0;

        return processExchange(request({
            method: "POST",
            url: FB_API_BASE_URL,
            data: {
                "access_token": TOKEN,
                "batch": JSON.stringify(fbRequestObj, null, 0)
            }
        }));
    }
};

/**
 * Sends all queued requests if the client operates in the batched request mode. The Graph API v2.8 accepts up to
 * 50 sub-request per batch request.
 * @see <a href="https://developers.facebook.com/docs/graph-api/making-multiple-requests">Graph API - Making Batch Requests</a>
 * @example const bot = new FBMessenger("my-page-token", true);
 * for (let i = 1; i <= 50; i++) {
 *   bot.sendTextMessage(userId, "A message #" + i);
 * }
 * bot.sendBatch();
 */
FBMessenger.prototype.sendBatch = function() {
    return this._batchRequest();
};

/**
 * Sends a typing indicators or send read receipts to the given user id.
 * @param {string} id recipient user id
 * @param {string} action the specific sender action to send: `mark_seen`, `typing_on`, or `typing_off`
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/sender-actions">Messenger Platform - Sender Actions</a>
 */
FBMessenger.prototype.sendSenderAction = function(id, action) {
    return this._request("me/messages", {
        "recipient": {
            "id": id
        },
        "sender_action": action
    });
};

/**
 * Sends a plain text message to the user.
 * @param {string} id recipient user id
 * @param {string} messageText the message text
 * @param {string} notificationType push notification type, defaults to `REGULAR`
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/text-message">Messenger Platform - Text Message</a>
 */
FBMessenger.prototype.sendTextMessage = function(id, messageText, notificationType, tag) {
    return this._request("me/messages", {
        "recipient": {
            "id": id
        },
        "message": {
            "text": messageText
        },
        "notification_type": notificationType || NOTIFICATION_DEFAULT
    }, null, "POST", tag);
};

/**
 * Sends an reusable attachment to the user.
 * @param {string} id recipient user id
 * @param {string} type the Send API content type of the reusable attachment
 * @param {string} attachment the id of the reusable attachment
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference#attachment_reuse">Messenger Platform - Attachment Reuse</a>
 * @example bot.sendReusableAttachment(userId, "image", "1234567890");
 */
FBMessenger.prototype.sendReusableAttachment = function(id, type, attachment, notificationType, tag) {
    let data = {
        "recipient": {
            "id": id
        },
        "message": {
            "attachment": {
                "type": type,
                "payload": {
                    "attachment_id": attachment
                }
            }
        },
        "notification_type": notificationType || NOTIFICATION_DEFAULT
    };

    return this._request("me/messages", data, null, "POST", tag);
};

/**
 * Sends an image attachment via uploading them or sharing a URL to the image.
 * Supported formats are `jpg`, `png` and `gif`.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} image the image to send via URL or multipart stream
 * @param {boolean} reusable true if the image can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/image-attachment">Messenger Platform - Image Attachment</a>
 * @example // via multipart upload
 * let {Path} = require("fs");
 * let filePath = new Path(module.resolve("/path/to/photo.jpg"));
 * let multipart = new MultipartStream("photo.jpg", filePath);
 * bot.sendImageAttachment(userId, multipart);
 *
 * // via URL
 * bot.sendImageAttachment(userId, "http://example.org/photo.jpg");
 */
FBMessenger.prototype.sendImageAttachment = function(id, image, reusable, notificationType, tag) {
    return this.sendAttachment("image", id, image, reusable, null, notificationType, tag);
};

/**
 * Sends an image attachment via uploading them or sharing a URL to the recording.
 * Supported format is `mp3`.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} audio the audio file to send via URL or multipart stream
 * @param {boolean} reusable true if the audio can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/audio-attachment">Messenger Platform - Audio Attachment</a>
 * @example // via multipart upload
 * let {Path} = require("fs");
 * let filePath = new Path(module.resolve("/path/to/music.mp3"));
 * let multipart = new MultipartStream("music.mp3", filePath);
 * bot.sendAudioAttachment(userId, multipart);
 *
 * // via URL
 * bot.sendAudioAttachment(userId, "http://orf.at/fm4.mp3");
 */
FBMessenger.prototype.sendAudioAttachment = function(id, audio, reusable, notificationType, tag) {
    return this.sendAttachment("audio", id, audio, reusable, null, notificationType, tag);
};

/**
 * Sends an image attachment via uploading them or sharing a URL to the video.
 * Supported format is `mp4`.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} video the video to send via URL or multipart stream
 * @param {boolean} reusable true if the video can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/video-attachment">Messenger Platform - Video Attachment</a>
 * @example // via multipart upload
 * let {Path} = require("fs");
 * let filePath = new Path(module.resolve("/path/to/video.mp4"));
 * let multipart = new MultipartStream("video.mp4", filePath);
 * bot.sendVideoAttachment(userId, multipart);
 *
 * // via URL
 * bot.sendVideoAttachment(userId, "http://orf.at/orfIII.mp4");
 */
FBMessenger.prototype.sendVideoAttachment = function(id, video, reusable, notificationType, tag) {
    return this.sendAttachment("video", id, video, reusable, null, notificationType, tag);
};

/**
 * Sends a file to download via upload or by providing an URL to the file.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} file the file to send via URL or multipart stream
 * @param {boolean} reusable true if the file can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/file-attachment">Messenger Platform - File Attachment</a>
 */
FBMessenger.prototype.sendFileAttachment = function(id, file, reusable, notificationType, tag) {
    return this.sendAttachment("file", id, file, reusable, null, notificationType, tag);
};

/**
 * Sends a generic template with images in a horizontal scrollable carousel of items.
 * @param {string} id recipient user id
 * @param {Array} elements horizontal scrollable carousel of items.
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/generic-template">Messenger Platform - Generic Template</a>
 * @example bot.sendGenericTemplate(message.sender.id, [
 *   {
 *     "title":"„Pokemon Go“: Headline",
 *     "image_url":"http://orf.at/4699402.jpg",
 *     "subtitle":"Pikachu und Co. erobern erneut die Welt.",
 *     "buttons":[
 *       {
 *         "type":"web_url",
 *         "url":"http://orf.at/stories/2349101/",
 *         "title":"Story lesen \uD83D\uDC53"
 *       },
 *       {
 *         "type":"postback",
 *         "title":"Mehr zu Pokemon Go",
 *         "payload": "news:stories:pokemongo"
 *       }
 *     ]
 *   },
 *   {
 *     "title":"Alles steht Kopf",
 *     "image_url":"http://orf.at/pixar.jpg",
 *     "subtitle":"„Alles steht Kopf“ spielt im Hirn.",
 *     "buttons":[
 *       {
 *         "type":"web_url",
 *         "url":"http://orf.at/stories/2300732/",
 *         "title":"Story lesen \uD83D\uDC53"
 *       },
 *       {
 *         "type":"postback",
 *         "title":"Mehr über Pixar",
 *         "payload": "news:stories:pixar"
 *       }
 *     ]
 *   }
 * ]);
 */
FBMessenger.prototype.sendGenericTemplate = function(id, elements, notificationType, tag) {
    return this._request("me/messages", {
        "recipient": {
            "id": id
        },
        "message": {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "generic",
                    "elements": elements
                }
            }
        },
        "notification_type": notificationType || NOTIFICATION_DEFAULT
    }, null, "POST", tag);
};

/**
 * Sends a text and buttons attachment to request input from the user.
 * @param {string} id recipient user id
 * @param {string} text the text at the top of the buttons
 * @param {Array} buttons an array of buttons
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/button-template">Messenger Platform - Button Template</a>
 * @example bot.sendButtonTemplate(userId, "Who will win?", [
 *   {
 *     "type": "postback",
 *     "title": "Austria",
 *     "payload": "vote:austria"
 *   },
 *   {
 *     "type": "postback",
 *     "title": "Germany",
 *     "payload": "vote:germay"
 *   },
 *   {
 *     "type":"web_url",
 *     "url":"http://sport.ORF.at",
 *     "title":"Visit sport.ORF.at"
 *   }
 * ]);
 */
FBMessenger.prototype.sendButtonTemplate = function(id, text, buttons, notificationType, tag) {
    return this._request("me/messages", {
        "recipient": {
            "id": id
        },
        "message": {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "button",
                    "text": text,
                    "buttons": buttons
                }
            }
        },
        "notification_type": notificationType || NOTIFICATION_DEFAULT
    }, null, "POST", tag);
};

/**
 * Sends a template with the provided payload. This is useful to send list templates, receipt templates, airline
 * templates, or other specific templates not covered by the generic and button template call.
 * @param {string} id recipient user id
 * @param {Object} payload the payload depending on the template to send
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/list-template">Messenger Platform - List Template</a>
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/receipt-template">Messenger Platform - Receipt Template</a>
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/airline-itinerary-template">Messenger Platform - Airline Itinerary Template</a>
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/airline-boardingpass-template">Messenger Platform - Boarding Pass Template</a>
 * @example bot.sendAdvancedTemplate(message.sender.id, {
 *   "template_type": "airline_checkin",
 *   "intro_message": "Check-in is available now!",
 *   "locale": "en_US",
 *   "pnr_number": "XYZDD",
 *   "flight_info": [
 *     {
 *       "flight_number": "RG1234",
 *       "departure_airport": {
 *         "airport_code": "VIE",
 *         "city": "Vienna International Airport",
 *         "terminal": "T3",
 *         "gate": "F16"
 *       },
 *       "arrival_airport": {
 *         "airport_code": "TSR",
 *         "city": "Timișoara",
 *         "terminal": "T1",
 *         "gate": "G1"
 *       },
 *       "flight_schedule": {
 *         "boarding_time": "2016-12-24T10:00",
 *         "departure_time": "2016-12-24T11:00",
 *         "arrival_time": "2016-12-24T12:10"
 *       }
 *     }
 *   ],
 *   "checkin_url": "https:\/\/www.orf.at"
 * );
 */
FBMessenger.prototype.sendAdvancedTemplate = function(id, payload, notificationType, tag) {
    return this._request("me/messages", {
        "recipient": {
            "id": id
        },
        "message": {
            "attachment": {
                "type": "template",
                "payload": payload
            }
        },
        "notification_type": notificationType || NOTIFICATION_DEFAULT
    }, null, "POST", tag);
};

/**
 * Sends a quick reply to present buttons to the user.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} attachmentOrText attachment for the message
 * @param {Array} quickReplies the provided quick replies
 * @param {boolean} reusable true if the attachment can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @param {string} tag message tag to send outside the 24+1 time window
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/quick-replies">Messenger Platform - Quick Replies</a>
 * @example bot.sendQuickReplies(message.sender.id, "http://orf.at/animated.gif", [
 *   {
 *     "content_type": "text",
 *     "title": "WTF?!",
 *     "payload": "quick:wtf:" + Date.now()
 *   },
 *   {
 *     "content_type": "text",
 *     "title": "Cool!",
 *     "payload": "quick:cool:" + Date.now()
 *   }
 * ]);
 */
FBMessenger.prototype.sendQuickReplies = function(id, attachmentOrText, quickReplies, reusable, notificationType, tag) {
    if (typeof attachmentOrText === "string") {
        return this._request("me/messages", {
            "recipient": {
                "id": id
            },
            "message": {
                "text": attachmentOrText,
                "quick_replies": quickReplies
            },
            "notification_type": notificationType || NOTIFICATION_DEFAULT
        }, null, "POST", tag);
    } else if (attachmentOrText instanceof MultipartStream) {
        this.sendAttachment("image", id, attachmentOrText, reusable, quickReplies, notificationType, tag);
    } else {
        return this._request("me/messages", {
            "recipient": {
                "id": id
            },
            "message": {
                "attachment": attachmentOrText
            },
            "notification_type": notificationType || NOTIFICATION_DEFAULT
        }, null, "POST", tag);
    }
};

/**
 * Sets the thread greeting text for the start of a conversation with the bot.
 *
 * @param {string} greetings an array of greetings in different locales
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/messenger-profile/greeting-text">Messenger Platform - Greeting Text</a>
 * @example bot.setThreadGreetingText([
 *   {
 *     "locale": "default",
 *     "text": "Hello World!"
 *   },
 *   {
 *     "locale": "en_US",
 *     "text": "Hello USA!"
 *   }
 * ]);
 */
FBMessenger.prototype.setGreetingText = function(greetings) {
    return this._request("me/messenger_profile", {
        "greeting": greetings
    });
};

/**
 * Sets a Get Started button for the welcome screen.
 * @param {string} payloadString the payload string to reply to the bot
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/messenger-profile/get-started-button">Messenger Platform - Get Started Button</a>
 * @example let payloadString = JSON.stringify({ event: "user_pressed_started" });
 * bot.setThreadGetStartedButton(payloadString);
 */
FBMessenger.prototype.setGetStartedButton = function(payloadString) {
    return this._request("me/messenger_profile", {
        "get_started": {
            "payload": payloadString
        }
    });
};

/**
 * Sets a persistent menu always available for a user. This menu should contain top-level actions that users can
 * enact at any point. You must set up a "Get Started" button if you also wish to use persistent menu.
 * <code>call_to_actions</code> is limited to 3 items for the top level, and 5 items for any submenus.
 *
 * <em>This method changed from 2.x to 3.x due the new Messenger APIs.</em>
 *
 * @param {Array} menuItems an array menus; each menu requires a specified locale and an array of call to action items,
 *                      and an optional composer input setting
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/messenger-profile/persistent-menu">Messenger Platform - Persistent Menu</a>
 * @example bot.setPersistentMenu([
 *   {
 *     "locale": "default",
 *     "composer_input_disabled": true,
 *     "call_to_actions": [
 *       {
 *         "type": "postback",
 *         "title": "Current News",
 *         "payload": "read:news"
 *       },
 *       {
 *         "type": "postback",
 *         "title": "Bundesliga Results",
 *         "payload": "read:buli.results"
 *       },
 *       {
 *         "type": "web_url",
 *         "url": "http://sport.ORF.at",
 *         "title": "Visit sport.ORF.at"
 *       },
 *       {
 *         "title": "About",
 *         "type": "nested",
 *         "call_to_actions": [
 *            {
 *              "type":"web_url",
 *              "url":"http://sport.ORF.at/about/",
 *              "title": "About Sport"
 *           },
 *           {
 *              "type":"web_url",
 *              "url":"http://news.ORF.at/about/",
 *              "title":"About News"
 *           }
 *         ]
 *       }
 *     ]
 *   },
 *   {
 *     "locale": "de",
 *     "composer_input_disabled": false,
 *     "call_to_actions": [
 *       {
 *         "type": "postback",
 *         "title": "Aktuelle Nachrichten",
 *         "payload": "read:news"
 *       },
 *       {
 *         "type": "postback",
 *         "title": "Fußballspiele",
 *         "payload": "read:buli.results"
 *       },
 *       {
 *         "type":"web_url",
 *         "url":"http://sport.ORF.at",
 *         "title":"Visit sport.ORF.at"
 *       }
 *     ]
 *   }
 * ]);
 */
FBMessenger.prototype.setPersistentMenu  = function(menuItems) {
    return this._request("me/messenger_profile", {
        "persistent_menu": menuItems
    });
};

/**
 * Gets basic public accessible user profile information.
 * @param {string} userId the user's id
 * @param {Array} fields optional fields to retrieve.
 * @example bot.getUserProfile(userId, ["locale", "timezone"]);
 */
FBMessenger.prototype.getUserProfile = function(userId, fields) {
    let queryFields = "first_name,last_name,profile_pic,locale,timezone,gender";
    if (Array.isArray(fields)) {
        queryFields = fields.join(",");
    }

    return this._request(userId, null, "&fields=" + queryFields, "GET");
};

/**
 * Whitelists an array of domains as suitable for Web Views and other plugins. Up to 10 domains allowed.
 * @param {Array} domains a list of domains to whitelist
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/messenger-profile/domain-whitelisting">Messenger Platform - Domain Whitelisting</a>
 * @example bot.whitelistDomains(["https://orf.at", "https://ringojs.org"]);
 */
FBMessenger.prototype.whitelistDomains = function(domains) {
    return this._request("me/messenger_profile", {
        "whitelisted_domains": domains
    });
};

/**
 * Allows to specify an <code>account_linking_url</url>
 * @param {string} accountLinkingUrl the authentication callback URL
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/messenger-profile/account-linking-url">Messenger Platform - Account Linking</a>
 * @example bot.setAccountLinkUrl("https://auth.example.org/foo/bar.aspx");
 */
FBMessenger.prototype.setAccountLinkUrl = function(accountLinkingUrl) {
    return this._request("me/messenger_profile", {
        "account_linking_url": accountLinkingUrl
    });
};

/**
 * Lets specify target audiences for the bot.
 * @param {string} audienceType the audience type to set; valid values are
 *                              <code>all</code>, <code>custom</code>, or <code>none</code>
 * @param {object} countries the country object containing a whitelist or a blacklist property
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/messenger-profile/target-audience">Messenger Platform - Target Audience</a>
 * @example bot.setAudienceType("custom", {
 *   "whitelist": ["DE", "AT", "CH"]
 * });
 *
 * bot.setAudienceType("all");
 */
FBMessenger.prototype.setAudienceType = function(audienceType, countries) {
    switch (audienceType) {
        case "none":
        case "all": {
            return this._request("me/messenger_profile", {
                "target_audience": {
                    "audience_type": audienceType
                }
            });
        }
        case "custom": {
            return this._request("me/messenger_profile", {
                "target_audience": {
                    "audience_type": audienceType,
                    "countries": countries
                }
            });
        }
    }

    throw new Error("Invalid audience type " + audienceType);
};

/**
 * Enables a chat extension in the composer drawer.
 * @param {object} homeUrl a home url object with the required properties url, web view ratio, and testing status
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/messenger-profile/home-url">Messenger Platform - Home URL</a>
 * @example bot.setHomeUrl({
 *   "url": "https://dev.orf.at/",
 *   "webview_height_ratio": "tall",
 *   "webview_share_button": "show",
 *   "in_test": true
 * });
 */
FBMessenger.prototype.setHomeUrl = function(homeUrl) {
    return this._request("me/messenger_profile", {
        "home_url": homeUrl
    });
};

/**
 * Allows to delete specific fields of the bot's messenger profile.
 * @param {Array} fields fields to unset
 * @example bot.deleteProfileFields(["home_url"]);
 */
FBMessenger.prototype.deleteProfileFields = function(fields) {
    return this._request("me/messenger_profile", {
        "fields": fields
    }, null, "DELETE");
};
