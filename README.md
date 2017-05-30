# fbmessenger

Facebook Messenger Bot client for RingoJS. It provides a convenient
interface to the HTTP-based Messenger platform. The client has been
tested with RingoJS 0.12 and newer. It supports all API methods of the
Facebook Graph API v2.7 from July 13, 2016.

## Example

```javascript
const bot = new FBMessenger("inser_pagetoken_here");

bot.sendTextMessage(recipientId, "Servus, I'm a bot!");

bot.sendButtonTemplate(recipientId, "Hello!", [
  {
    "type": "web_url",
    "title": "Open Link",
    "url": "http://dev.ORF.at/"
  },
  {
    "type": "postback",
    "title": "Get More Info",
    "payload": JSON.stringify({ event: "get_more" })
  }
]);

```

## Non-Goals

The following APIs and methods are not implemented and not planned to be anytime soon:

* ID Matching API
* Payments

## License

This package is licensed under the Apache License Version 2.0. You can
copy, modify and distribute the bot client in source and/or binary form.
Please mark all modifications clearly as being the work of the modifier.

## Changelog

- 3.0.0 - implements changes for Messenger Platform v1.4 and v2.0, changed parameter order for templates, added message tags and changed parameter order for `sendXYZ()` methods, removed old thread APIs, added basic test bot
- 2.3.0 - support for batched requests to the Graph API
- 2.2.0 - adds support for Messenger Platform v1.3, new method `isReferral()` in utils to detect referral webhook calls
- 2.1.0 - minor bugfix in the attachment methods
- 2.0.0 - implements Messenger Platform v1.2, adds `sendReusableAttachment()` method, breaking change: new signatures of all  `sendXyzAttachment()` methods to send reusable attachments
- 1.0.0 - initial release for Messenger Platform v1.1
