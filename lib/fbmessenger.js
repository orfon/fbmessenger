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
 * and handles potential error. The supported Graph API level is v2.7.
 * @type {FBMessenger}
 * @param {string} pageAccessToken the bot's access token to a Facebook page
 */
const FBMessenger = exports.FBMessenger = function FBMessenger(pageAccessToken) {
    const FB_API_URL = "https://graph.facebook.com/v2.7/";
    const TOKEN = pageAccessToken;

    const processExchange = function(exchange) {
        let resp;
        try {
            resp = JSON.parse(exchange.content);
        } catch (e) {
            throw new Error("Could not parse JSON response by Messenger Send API: " + e);
        }

        if(exchange.status !== 200 || resp.hasOwnProperty("error")) {
            if (resp != null && resp.hasOwnProperty("error")) {
                throw new GraphApiError("Messenger Send API error code " + resp.error.code + "; " +
                    resp.error.type + "; " + resp.error.message, resp);
            } else {
                throw new GraphApiError("Messenger Send API returned unknown error.", resp);
            }
        }

        if (resp != null) {
            return resp;
        } else {
            throw new GraphApiError("Messenger Send API returned unknown error.", resp);
        }
    };

    /**
     * @ignore
     */
    this._request = function(graphEndpoint, payload, queryString, method) {
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
        }

        return processExchange(request({
            url: FB_API_URL + graphEndpoint + "?access_token=" + TOKEN + (queryString != null ? queryString : ""),
            method: method ? method : "POST",
            data: payload ? JSON.stringify(payload) : "",
            headers: {
                "Cache-Control": "no-cache, no-store",
                "Content-Type": "application/json; charset=utf-8"
            }
        }));
    };

    /**
     * @ignore
     */
    this._requestMultipart = function(graphEndpoint, payload) {
        if (payload != null && !payload instanceof Object) {
            throw new Error("Invalid payload for Messenger Send API: " + typeof obj);
        }

        if (!payload.hasOwnProperty("recipient")) {
            throw new Error("Invalid payload for Messenger Send API: recipient missing!");
        }

        const multipartPayload = {};
        for (let name in payload) {
            if (payload[name] instanceof MultipartStream) {
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
                if (payload[name] instanceof MultipartStream && !payload[name].stream.closed()) {
                    payload[name].stream.close();
                }
            }
        }
    };

    /**
     * @ignore
     */
    this.sendAttachment = function (type, id, attachment, reusable, quickReplies, notificationType) {
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
        if (reusable != null) {
            data.message.attachment.payload.is_reusable = reusable === true;
        }

        if (typeof attachment === "string" && strings.isUrl(attachment)) {
            data.message.attachment.payload.url = attachment;
            return this._request("me/messages", data);
        } else if (attachment instanceof MultipartStream) {
            data.filedata = attachment;
            return this._requestMultipart("me/messages", data);
        } else {
            throw new Error("FBMessenger attachment must be an URL or MultipartStream!");
        }
    };
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
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/text-message">Messenger Platform - Text Message</a>
 */
FBMessenger.prototype.sendTextMessage = function(id, messageText, notificationType) {
    return this._request("me/messages", {
        "recipient": {
            "id": id
        },
        "message": {
            "text": messageText
        },
        "notification_type": notificationType || NOTIFICATION_DEFAULT
    });
};

/**
 * Sends an reusable attachment to the user.
 * @param {string} id recipient user id
 * @param {string} type the Send API content type of the reusable attachment
 * @param {string} attachment the id of the reusable attachment
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference#attachment_reuse">Messenger Platform - Attachment Reuse</a>
 * @example bot.sendReusableAttachment(userId, "image", "1234567890");
 */
FBMessenger.prototype.sendReusableAttachment = function(id, type, attachment, notificationType) {
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

    return this._request("me/messages", data);
};

/**
 * Sends an image attachment via uploading them or sharing a URL to the image.
 * Supported formats are `jpg`, `png` and `gif`.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} image the image to send via URL or multipart stream
 * @param {boolean} reusable true if the image can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
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
FBMessenger.prototype.sendImageAttachment = function(id, image, reusable, notificationType) {
    return this.sendAttachment("image", id, image, reusable, null, notificationType);
};

/**
 * Sends an image attachment via uploading them or sharing a URL to the recording.
 * Supported format is `mp3`.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} audio the audio file to send via URL or multipart stream
 * @param {boolean} reusable true if the audio can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
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
FBMessenger.prototype.sendAudioAttachment = function(id, audio, reusable, notificationType) {
    return this.sendAttachment("audio", id, audio, reusable, null, notificationType);
};

/**
 * Sends an image attachment via uploading them or sharing a URL to the video.
 * Supported format is `mp4`.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} video the video to send via URL or multipart stream
 * @param {boolean} reusable true if the video can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
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
FBMessenger.prototype.sendVideoAttachment = function(id, video, reusable, notificationType) {
    return this.sendAttachment("video", id, video, reusable, null, notificationType);
};

/**
 * Sends a file to download via upload or by providing an URL to the file.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} file the file to send via URL or multipart stream
 * @param {boolean} reusable true if the file can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/send-api-reference/file-attachment">Messenger Platform - File Attachment</a>
 */
FBMessenger.prototype.sendFileAttachment = function(id, file, reusable, notificationType) {
    return this.sendAttachment("file", id, file, reusable, null, notificationType);
};

/**
 * Sends a generic template with images in a horizontal scrollable carousel of items.
 * @param {string} id recipient user id
 * @param {Array} elements horizontal scrollable carousel of items.
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
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
FBMessenger.prototype.sendGenericTemplate = function(id, elements, notificationType) {
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
    });
};

/**
 * Sends a text and buttons attachment to request input from the user.
 * @param {string} id recipient user id
 * @param {string} text the text at the top of the buttons
 * @param {Array} buttons an array of buttons
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
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
FBMessenger.prototype.sendButtonTemplate = function(id, text, buttons, notificationType) {
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
    });
};

/**
 * Sends a template with the provided payload. This is useful to send list templates, receipt templates, airline
 * templates, or other specific templates not covered by the generic and button template call.
 * @param {string} id recipient user id
 * @param {Object} payload the payload depending on the template to send
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
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
FBMessenger.prototype.sendAdvancedTemplate = function(id, payload, notificationType) {
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
    });
};

/**
 * Sends a quick reply to present buttons to the user.
 * @param {string} id recipient user id
 * @param {string|MultipartStream} attachmentOrText attachment for the message
 * @param {Array} quickReplies the provided quick replies
 * @param {boolean} reusable true if the attachment can be cached by Facebook, defaults to false
 * @param {string} notificationType push notification type, defaults to `REGULAR`.
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
FBMessenger.prototype.sendQuickReplies = function(id, attachmentOrText, quickReplies, reusable, notificationType) {
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
        });
    } else if (attachmentOrText instanceof MultipartStream) {
        this.sendAttachment("image", id, attachmentOrText, reusable, quickReplies, notificationType);
    } else {
        return this._request("me/messages", {
            "recipient": {
                "id": id
            },
            "message": {
                "attachment": attachmentOrText
            },
            "notification_type": notificationType || NOTIFICATION_DEFAULT
        });
    }
};

/**
 * Sets the thread greeting text for the start of a conversation with the bot.
 * @param {string} message the greeting message as plain text
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/thread-settings/greeting-text">Messenger Platform - Greeting Text</a>
 * @example bot.setThreadGreetingText("Hello World!");
 */
FBMessenger.prototype.setThreadGreetingText = function(message) {
    return this._request("me/thread_settings", {
        "setting_type": "greeting",
        "greeting": {
            "text": message
        }
    });
};

/**
 * Sets a Get Started button for the welcome screen.
 * @param {string} payloadString the payload string to reply to the bot
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/thread-settings/get-started-button">Messenger Platform - Get Started Button</a>
 * @example let payloadString = JSON.stringify({ event: "user_pressed_started" });
 * bot.setThreadGetStartedButton(payloadString);
 */
FBMessenger.prototype.setThreadGetStartedButton = function(payloadString) {
    return this._request("me/thread_settings", {
        "setting_type": "call_to_actions",
        "thread_state": "new_thread",
        "call_to_actions": [
            {
                "payload": payloadString
            }
        ]
    });
};

/**
 * Sets a persistent menu always available for a user. This menu should contain top-level actions that users can
 * enact at any point.
 * @param {Array} menuItems an array of call to action items
 * @see <a href="https://developers.facebook.com/docs/messenger-platform/thread-settings/persistent-menu">Messenger Platform - Persistent Menu</a>
 * @example bot.setPersistentMenu([
 *   {
 *     "type": "postback",
 *     "title": "Current News",
 *     "payload": "read:news"
 *   },
 *   {
 *     "type": "postback",
 *     "title": "Bundesliga Results",
 *     "payload": "read:buli.results"
 *   },
 *   {
 *     "type":"web_url",
 *     "url":"http://sport.ORF.at",
 *     "title":"Visit sport.ORF.at"
 *   }
 * ]);
 */
FBMessenger.prototype.setPersistentMenu  = function(menuItems) {
    return this._request("me/thread_settings", {
        "setting_type": "call_to_actions",
        "thread_state": "existing_thread",
        "call_to_actions": menuItems
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
    if (fields != null && Array.isArray(fields)) {
        queryFields = fields.join(",");
    }

    return this._request(userId, null, "&fields=" + queryFields, "GET");
};
