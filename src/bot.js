import * as dotenv from "dotenv";
import moment from "moment";

import app from "../lib/apps";
import ci from "../lib/custom_integrations";

dotenv.config();

export default class Bot {
    static config = {
        spiel: {
            no: "I'm sorry. I'm afraid I can't do that",
            entry: "Ignore me, just here to make sure no one works late!",
            confused: "Sorry, I don't know what you want from me.",
        },
        reaction: {
            default: "go_home",
        },
        time: {
            zone: {
                default: -4,
            },
            day: {
                start: 7,
                length: 12,
            },
        },
        vocab: {
            control: {
                leave: "leave",
                join: "join",
            },
        },
    };

    static controller = {
        RTM_OPEN: "rtm_open",
        RTM_CLOSE: "rtm_close",
        CHANNEL_JOIN: "bot_channel_join",
        GROUP_JOIN: "bot_group_join",
        AMBIENT: "ambient",
        DIRECT_MESSAGE: "direct_message",
        DIRECT_MENTION: "direct_mention",
        MENTION: "mention",
    };

    /**
     * Handle bot initialization
     */
    constructor() {
        const { TOKEN } = Bot.getProcessEnv();
        this.configStore(!!TOKEN);
    }

    /**
     * Configure the persistence options
     */
    configStore = custom => {
        this.config = {
            json_file_store: custom
                ? "./db_slack_bot_ci/"
                : "./db_slack_bot_a/",
        };
    };

    /**
     * Define a function for initiating a conversation on installation
     * With custom integrations, we do not have a way to find out who installed us
     * so we can not message them :(
     * @param bot reference to the bot
     * @param installer the user who installed bot
     */
    onInstallation(bot, installer) {
        if (installer) {
            bot.startPrivateConversation({ user: installer }, (err, convo) => {
                if (err) {
                    console.warn(err);
                } else {
                    convo.say("I am a bot that has just joined your team");
                    convo.say(`You must now /invite me to a channel 
                    so that I can be of use!`);
                }
            });
        }
    }

    static getProcessEnv() {
        return Object.assign({}, process.env);
    }

    /**
     * Are being run as an app or a custom integration?
     * The initialization will differ, depending
     */
    newController = ({
        TOKEN,
        SLACK_TOKEN,
        CLIENT_ID,
        CLIENT_SECRET,
        PORT,
    } = {}) => {
        if (TOKEN || SLACK_TOKEN) {
            const token = TOKEN || SLACK_TOKEN;
            return ci.configure(token, this.config, this.onInstallation);
        }
        if (CLIENT_ID && CLIENT_SECRET && PORT) {
            return app.configure(
                PORT,
                CLIENT_ID,
                CLIENT_SECRET,
                this.config,
                this.onInstallation,
            );
        }
        console.error(`If this is a custom integration, please 
            specify TOKEN in the environment. If this is an app, please 
            specify CLIENTID, CLIENTSECRET, and PORT in the environment`);
        return process.exit(1);
    };

    /**
     * Create bot controller and register listener hooks
     */
    connect = () => {
        this.registerListeners(this.newController(Bot.getProcessEnv()));
    };

    onRtmOpen = () => {
        this.isConnected = true;
        /* eslint-disable-next-line */
        console.log("** The RTM api just connected!");
        this.connect();
    };

    onRtmClose = () => {
        this.isConnected = false;
        /* eslint-disable-next-line */
        console.log("** The RTM api just closed");
        this.connect();
    };

    /**
     * Register events to controller
     * @param controller bot controller
     */
    registerListeners = controller => {
        controller.on(Bot.controller.RTM_OPEN, this.onRtmOpen);
        controller.on(Bot.controller.RTM_CLOSE, this.onRtmClose);
        controller.on(Bot.controller.CHANNEL_JOIN, this.handleNewRoom);
        controller.on(Bot.controller.GROUP_JOIN, this.handleNewRoom);
        const { DIRECT_MESSAGE, DIRECT_MENTION, MENTION } = Bot.controller;
        controller.hears(
            Object.values(Bot.config.vocab.control),
            [DIRECT_MESSAGE, DIRECT_MENTION, MENTION],
            this.handleDM,
        );
        controller.on(Bot.controller.AMBIENT, this.handleChatter);
    };

    /**
     * Handle requests to join or leave rooms
     * @param self reference to the bot controller
     * @param {string} action the instruction for bot
     * @param message the message spawing action
     */
    joinLeaveRoom = (self, action, message) => {
        const { spiel } = Bot.config;
        const payload = {
            name: message.text.split(" ")[1],
        };
        const onError = (_, response) => {
            console.warn("joinleave:", response);
            self.reply(message, spiel.no);
        };
        return action === Bot.config.vocab.control.leave
            ? self.api.channels.leave(payload, onError)
            : self.api.channels.join(payload, onError);
    };

    /**
     * Handle messages sent to bot private chat
     * @param self reference to the bot
     * @param message the post message
     */
    handleDM = (self, message) => {
        const action = message.match[0];
        const { control } = Bot.config.vocab;
        switch (action.toLowerCase()) {
            case control.leave:
            case control.join:
                this.joinLeaveRoom(self, action, message);
                break;
            default:
                self.reply(message, Bot.config.spiel.confused);
        }
    };

    /**
     * Handle entering a new channel or group
     * @param {*} self reference to the bot
     * @param {*} message the post message
     */
    handleNewRoom(self, message) {
        self.reply(message, Bot.config.spiel.entry);
    }

    shouldUseReaction() {
        return Math.random() < 0.6;
    }

    /**
     * Handle posts made in channel not directed at bot
     * @param self reference to the bot
     * @param message the post message
     */
    handleChatter = (self, message) => {
        self.api.users.info(message, (e, { user }) => {
            const isLocaleLate = this.isLate(
                Number(message.ts),
                Number(user.tz_offset),
            );
            if (isLocaleLate && !this.isTired()) {
                if (!this.shouldUseReaction()) {
                    self.reply(message, this.generateGoHome(message));
                } else {
                    self.api.reactions.add({
                        timestamp: message.ts,
                        channel: message.channel,
                        name: Bot.config.reaction.default,
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
        const {
            time: { zone: tmzone, day },
        } = Bot.config;
        const now = moment(timestamp * 1000);
        const tzInMinutes = timezone / 60;
        const offset = Number.isNaN(tzInMinutes) ? tmzone.default : tzInMinutes;
        now.utcOffset(offset, false);
        const dayStart = now
            .clone()
            .hour(day.start)
            .minute(0);
        const dayEnd = dayStart.clone().add(day.length, "h");
        return !now.isBetween(dayStart.toISOString(), dayEnd.toISOString());
    };

    /**
     * Idea is to be used for response rate limiting
     */
    isTired() {
        return false;
    }

    /**
     * Generates and returns a random go home message
     * @param {*} message the message spawing request
     */
    generateGoHome() {
        const options = [
            "Go home!",
            "Are you homeless?",
            "Stop working!",
            "Why are you here?",
        ];
        return options[Math.floor(Math.random() * options.length)];
    }
}
