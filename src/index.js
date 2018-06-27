import * as BotkitStorage from "botkit-storage-mongo";
import * as dotenv from "dotenv";
import moment from "moment";

import app from "../lib/apps";
import ci from "../lib/custom_integrations";

dotenv.config();

class Bot {
    /**
     * Handle bot initialization
     */
    constructor() {
        this.config = {
            spiel: {
                no: "I'm sorry. I'm afraid I can't do that",
                entry: "Ignore me, just here to make sure no one works late!",
                confused: "Sorry, I don't know what you want from me."
            },
            time: {
                zone: {
                    default: 4
                },
                day: {
                    start: 7,
                    length: 12
                }
            },
            vocab: {
                control: {
                    leave: "leave",
                    join: "join"
                }
            }
        }
        this.configStore();
    }

    /**
     * Configure the persistence options
     */
    configStore = () => {
        if (process.env.MONGOLAB_URI) {
            this.config.storage = BotkitStorage({
                mongoUri: process.env.MONGOLAB_URI
            });
        } else {
            this.config.json_file_store = (process.env.TOKEN) ?
                "./db_slack_bot_ci/" : "./db_slack_bot_a/";
        }
    }

    /**
     * Define a function for initiating a conversation on installation
     * With custom integrations, we do not have a way to find out who installed us
     * so we can not message them :(
     * @param bot reference to the bot
     * @param installer the user who installed bot
     */
    onInstallation(bot, installer) {
        if (installer) {
            bot.startPrivateConversation({
                user: installer
            }, function (err, convo) {
                if (err) {
                    console.log(err);
                } else {
                    convo.say("I am a bot that has just joined your team");
                    convo.say(`You must now /invite me to a channel 
                    so that I can be of use!`);
                }
            });
        }
    }

    /**
     * Are being run as an app or a custom integration? 
     * The initialization will differ, depending
     */
    newController = () => {
        if (process.env.TOKEN || process.env.SLACK_TOKEN) {
            //Treat this as a custom integration
            const token = (process.env.TOKEN) ?
                process.env.TOKEN : process.env.SLACK_TOKEN;
            return ci.configure(token, this.config, this.onInstallation);
        } else if (process.env.CLIENT_ID &&
            process.env.CLIENT_SECRET && process.env.PORT) {
            //Treat this as an app
            return app.configure(process.env.PORT, process.env.CLIENT_ID,
                process.env.CLIENT_SECRET, this.config, this.onInstallation);
        } else {
            console.log(`Error: If this is a custom integration, please 
            specify TOKEN in the environment. If this is an app, please 
            specify CLIENTID, CLIENTSECRET, and PORT in the environment`);
            process.exit(1);
        }
    }

    /**
     * Create bot controller and register listener hooks
     */
    connect = () => {
        this.registerListeners(this.newController());
    }

    /**
     * Register events to controller
     * @param controller bot controller
     */
    registerListeners = (controller) => {
        controller.on("rtm_open", function (bot) {
            console.log("** The RTM api just connected!");
        });
        controller.on("rtm_close", function (bot) {
            console.log("** The RTM api just closed");
            this.connect();
        });
        controller.on("bot_channel_join", this.handleNewRoom);
        controller.on("bot_group_join", this.handleNewRoom);
        controller.hears(
            Object.values(this.config.vocab.control), [
                "direct_message", "direct_mention", "mention"
            ], this.handleDM
        );
        controller.on("ambient", this.handleChatter);
    };

    /**
     * Handle requests to join or leave rooms
     * @param self reference to the bot
     * @param {string} action the instruction for bot
     * @param message the message spawing action
     */
    joinLeaveRoom = (self, action, message) => {
        const spiel = this.config.spiel;
        const payload = {
            name: message.text.split(" ")[1]
        };
        const onError = function (e, response) {
            console.log("joinleave:", response);
            self.reply(message, spiel.no);
        };
        return action === this.config.vocab.control.leave ?
            self.api.channels.leave(payload, onError) :
            self.api.channels.join(payload, onError);
    };

    /**
     * Handle messages sent to bot private chat
     * @param self reference to the bot
     * @param message the post message
     */
    handleDM = (self, message) => {
        console.log("direct:", message);
        const action = message.match[0];
        const control = this.config.vocab.control;
        switch (action.toLowerCase()) {
            case control.leave:
            case control.join:
                this.joinLeaveRoom(self, action, message);
                break;
            default:
                self.reply(message, spiel.confused);
        }
    };

    /**
     * Handle entering a new channel or group
     * @param {*} self reference to the bot
     * @param {*} message the post message
     */
    handleNewRoom(self, message) {
        console.log(message);
        self.reply(message, spiel.entry);
    };

    /**
     * Handle posts made in channel not directed at bot
     * @param self reference to the bot
     * @param message the post message
     */
    handleChatter = (self, message) => {
        console.log("go home!", message);
        self.api.users.info({
            user: message.user
        }, (e, response) => {
            console.log("user:", e);
            const isLocaleLate = this.isLate(
                Number(message.ts), Number(response.user.tz_offset)
            );
            if (isLocaleLate && !this.isTired()) {
                if (Math.random() < 0.6) {
                    self.reply(message, this.generateGoHome(message));
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
        });
    };

    /**
     * Returns true if message is sent out of working hours relative to user timezone
     * @param {number} timestamp the message timestamp e.g. 1530071118.000184 seconds
     * @param {number} timezone the utc offset of user posting e.g. -14400 seconds
     * @return boolean
     */
    isLate = (timestamp, timezone) => {
        const time = this.config.time;
        const now = moment(timestamp * 1000);
        const tz_minutes = timezone / 60;
        const offset = isNaN(tz_minutes) ? time.zone.default : tz_minutes;
        now.utcOffset(offset, true);
        const dayStart = now.clone().hour(time.day.start).minute(0);
        const dayEnd = dayStart.clone().add(time.day.length, "h");
        console.log(
            "time:", now.toISOString(), timezone,
            dayStart.toISOString(), dayEnd.toISOString()
        );
        return !now.isBetween(dayStart.toISOString(), dayEnd.toISOString());
    };

    /**
     * Idea is to be used for response rate limiting
     */
    isTired() {
        return false;
    };

    /**
     * Generates and returns a random go home message
     * @param {*} message the message spawing request
     */
    generateGoHome(message) {
        const options = [
            "Go home!", "Are you homeless?",
            "Stop working!", "Why are you here?"
        ];
        return options[Math.floor(Math.random() * options.length)];
    };
}
new Bot().connect();
