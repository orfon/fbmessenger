"use strict";

/**
 * @fileoverview Utility functions to interact with the Facebook Messenger platform and Graph API with the bot client.
 */

const strings = require("ringo/utils/strings");

/**
 * Filters out entries which are not destined to the given page id.
 * @param {Object} callbackData the callback object received via the webhook
 * @param {string} pageId unique identifier of the target page
 * @returns {Array} array with all entries for the page
 */
const getEntriesForPage = exports.getEntriesForPage = function(callbackData, pageId) {
    if (callbackData != null && callbackData.hasOwnProperty("object") && callbackData.object === "page") {
        if (Array.isArray(callbackData.entry)) {
            return callbackData.entry.filter(function(entry) {
                return entry.id === pageId;
            });
        }
    }

    return [];
};

/**
 * Filters out messaging objects which are not destined to the given page id.
 * @param {Object} callbackData the callback object received via the webhook
 * @param {string} pageId unique identifier of the target page
 * @returns {Array} array with all messaging objects
 */
const getMessagingForPage = exports.getMessagingForPage = function(callbackData, pageId) {
    return Array.prototype.concat.apply([], getEntriesForPage(callbackData, pageId).map(function(entry) {
        return (Array.isArray(entry.messaging) ? entry.messaging : []);
    }));
};

/**
 * Checks if the given callback data is a messaging callback or not.
 * @param {Object} callbackData the callback object received via the webhook
 * @returns true if messaging, false if not.
 */
const isMessagingCallback = exports.isMessagingCallback = function(callbackData) {
    return callbackData != null && typeof callbackData === "object"
        && callbackData.hasOwnProperty("object") && Array.isArray(callbackData.entry);
};

/**
 * Checks if the given entry is a message or not.
 * @param {Object} entry the callback entry to check
 * @param {boolean} allowEcho include echos in the check
 * @returns true if message, false if not.
 */
const isMessage = exports.isMessage = function(callbackEntry, allowEcho) {
    return callbackEntry != null && (allowEcho === true ? true : !isEcho(callbackEntry)) &&
        callbackEntry.hasOwnProperty("message") && callbackEntry.message.hasOwnProperty("mid");
};

/**
 * Checks if the given entry is a quick reply or not.
 * @param {Object} entry the callback entry to check
 * @param {boolean} allowEcho include echos in the check
 * @returns true if quick reply, false if not.
 */
const isQuickReply = exports.isQuickReply = function(callbackEntry, allowEcho) {
    return isMessage(callbackEntry, allowEcho || false) && callbackEntry.message.hasOwnProperty("quick_reply");
};

/**
 * Checks if the given entry is a postback or not.
 * @param {Object} entry the callback entry to check
 * @returns true if postback, false if not.
 */
const isPostback = exports.isPostback = function(callbackEntry) {
    return callbackEntry != null && callbackEntry.hasOwnProperty("postback") && callbackEntry.postback.hasOwnProperty("payload");
};

/**
 * Checks if the given entry is an authentication or not.
 * @param {Object} entry the callback entry to check
 * @returns true if authentication, false if not.
 */
const isAuthentication = exports.isAuthentication = function(callbackEntry) {
    return callbackEntry != null && callbackEntry.hasOwnProperty("optin") && callbackEntry.optin.hasOwnProperty("ref");
};

/**
 * Checks if the given entry is an account link or not.
 * @param {Object} entry the callback entry to check
 * @returns true if account link, false if not.
 */
const isAccountLinking = exports.isAccountLinking = function(callbackEntry) {
    return callbackEntry != null && callbackEntry.hasOwnProperty("account_linking") && callbackEntry.account_linking.hasOwnProperty("status");
};

/**
 * Checks if the given entry is a delivery notification or not.
 * @param {Object} entry the callback entry to check
 * @returns true if delivery, false if not.
 */
const isDelivery = exports.isDelivery = function(callbackEntry) {
    return callbackEntry != null && callbackEntry.hasOwnProperty("delivery") && callbackEntry.delivery.hasOwnProperty("mids");
};

/**
 * Checks if the given entry is a read confirmation or not.
 * @param {Object} entry the callback entry to check
 * @returns true if read confirmation, false if not.
 */
const isRead = exports.isRead = function(callbackEntry) {
    return callbackEntry != null && callbackEntry.hasOwnProperty("read") && callbackEntry.read.hasOwnProperty("watermark");
};

/**
 * Checks if the given entry is an echo or not.
 * @param {Object} entry the callback entry to check
 * @returns true if echo, false if not.
 */
const isEcho = exports.isEcho = function(callbackEntry) {
    return callbackEntry != null && callbackEntry.hasOwnProperty("message") && callbackEntry.message.is_echo === true;
};

/**
 * Checks if the given entry is a referral or not.
 * @param {Object} entry the callback entry to check
 * @returns true if referral, false if not.
 */
const isReferral = exports.isReferral = function(callbackEntry) {
    return callbackEntry != null && callbackEntry.hasOwnProperty("referral") && callbackEntry.referral.ref != null;
};

/**
 * Checks if the given parameter is a valid numeric Facebook identifier.
 * @param {*} id identifier to check
 * @returns true if valid Facebook id, false if not
 */
const isValidFacebookId = exports.isValidFacebookId = function(id) {
    return typeof id == "string" && strings.isNumeric(id);
};
