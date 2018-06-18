/**
 * A Bot for Slack!
 */

require('dotenv').config();

/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don"t have a way to find out who installed us, so we can"t message them :(
 */

function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({
            user: installer
        }, function (err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say("I am a bot that has just joined your team");
                convo.say("You must now /invite me to a channel so that I can be of use!");
            }
        });
    }
}


/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require("botkit-storage-mongo");
    config = {
        storage: BotkitStorage({
            mongoUri: process.env.MONGOLAB_URI
        }),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN) ? "./db_slack_bot_ci/" : "./db_slack_bot_a/"), //use a different name if an app or CI
    };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */

var newController = function () {
    if (process.env.TOKEN || process.env.SLACK_TOKEN) {
        //Treat this as a custom integration
        var customIntegration = require("./lib/custom_integrations");
        var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
        return customIntegration.configure(token, config, onInstallation);
    } else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
        //Treat this as an app
        var app = require("./lib/apps");
        return app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
    } else {
        console.log("Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment");
        process.exit(1);
    }
};


/**
 * Core bot logic goes here!
 */

var moment = require("moment");

var Bot = function (controller) {
    var spiel = {
        no: "I'm sorry. I'm afraid I can't do that",
        entry: "Ignore me, just here to make sure no one works late!",
        confused: "Sorry, I don't know what you want from me."
    };
    var vocab = {
        control: {
            leave: "leave",
            join: "join"
        }
    };
    var joinLeaveRoom = function (self, action, message) {
        var payload = {
            name: message.text.split(" ")[1]
        };
        var onError = function (e, response) {
            console.log("joinleave:", response);
            self.reply(message, spiel.no);
        };

        return action == vocab.control.leave ?
            self.api.channels.leave(payload, onError) :
            self.api.channels.join(payload, onError);
    };

    var handleDM = function (self, message) {
        console.log("direct:", message);
        var action = message.match[0];
        switch (action.toLowerCase()) {
            case vocab.control.leave:
            case vocab.control.join:
                joinLeaveRoom(self, action, message);
                break;
            default:
                self.reply(message, spiel.confused);
        }
    };

    var handleNewRoom = function (self, message) {
        console.log(message);
        self.reply(message, spiel.entry);
    };

    var handleChatter = function (self, message) {
        console.log("go home!", message);
        if (isLate(Number(message.ts)) && !isTired()) {
            if (Math.random() < 0.6) {
                self.reply(message, generateGoHome(message));
            } else {
                self.api.reactions.add({
                    timestamp: message.ts,
                    channel: message.channel,
                    name: 'go_home',
                }, function (e, response) {
                    console.log("reaction:", response);
                });
            }
        }
    };

    var isLate = function (timestamp) {
        var now = moment(timestamp * 1000);
        var dayStartToday = now.clone().hour(7).minute(0);
        var dayEndToday = dayStartToday.clone().add(12, "h");
        console.log(
            "time:", now.toISOString(),
            dayStartToday.toISOString(), dayEndToday.toDate()
        );
        return !now.isBetween(
            dayStartToday.toISOString(), dayEndToday.toISOString()
        );
    };

    var isTired = function () {
        return false;
    };

    var generateGoHome = function (message) {
        var options = [
            "Go home!", "Are you homeless?",
            "Stop working!", "Why are you here?"
        ];
        return options[Math.floor(Math.random() * options.length)];
    };

    var registerListeners = function (controller) {
        controller.on("rtm_open", function (bot) {
            console.log("** The RTM api just connected!");
        });
        controller.on("rtm_close", function (bot) {
            console.log("** The RTM api just closed");
            reconnect();
        });
        controller.on("bot_channel_join", handleNewRoom);
        controller.on("bot_group_join", handleNewRoom);
        controller.hears(
            Object.values(vocab.control), [
                "direct_message", "direct_mention", "mention"
            ], handleDM
        );
        controller.on("ambient", handleChatter);
    };

    var reconnect = function () {
        registerListeners(newController());
    };

    return {
        init: function () {
            registerListeners(controller);
        },
    };
};
new Bot(newController()).init();
