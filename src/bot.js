import * as dotenv from "dotenv";
import moment from "moment";
import { Botkit } from "botkit";
import {
    SlackAdapter,
    SlackMessageTypeMiddleware,
    SlackEventMiddleware,
} from "botbuilder-adapter-slack";

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
    };

    static controller = {
        RTM_OPEN: "rtm_open",
        RTM_CLOSE: "rtm_close",
        CHANNEL_JOIN: "bot_channel_join",
        GROUP_JOIN: "bot_group_join",
        MESSAGE: "message",
        DIRECT_MESSAGE: "direct_message",
        MENTION: "app_mention",
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

    static getProcessEnv() {
        return Object.freeze({ ...process.env });
    }

    /**
     * Are being run as an app or a custom integration?
     * The initialization will differ, depending
     */
    newController = (env = {}) => {
        const botToken = env.TOKEN || env.SLACK_TOKEN;
        if (!env.SLACK_SECRET || !botToken) {
            console.error(`Please specify SLACK_TOKEN or TOKEN
            and SLACK_SECRET to verify requests from slack`);
            return process.exit(1);
        }

        const adapter = new SlackAdapter({
            botToken,
            clientSigningSecret: env.SLACK_SECRET,
        });
        adapter.use(new SlackEventMiddleware());
        adapter.use(new SlackMessageTypeMiddleware());

        const controller = new Botkit({ adapter, ...this.config });
        controller.ready(async () => controller.spawn());

        return controller;
    };

    /**
     * Create bot controller and register listener hooks
     */
    connect = () => {
        this.registerListeners(this.newController(Bot.getProcessEnv()));
    };

    /**
     * Register events to controller
     * @param controller bot controller
     */
    registerListeners = controller => {
        controller.on(Bot.controller.CHANNEL_JOIN, this.handleNewRoom);
        controller.on(Bot.controller.GROUP_JOIN, this.handleNewRoom);
        controller.on(Bot.controller.MESSAGE, this.handleChatter);
        controller.on(Bot.controller.DIRECT_MESSAGE, this.handleDM);
        controller.on(Bot.controller.MENTION, this.handleDM);
    };

    /**
     * Handle messages sent to bot private chat
     * @param self reference to the bot
     * @param message the post message
     */
    handleDM = (self, message) => {
        const { recipient: bot, channelData: data } = message.incoming_message;
        const [action] = data.text
            .replace(`<@${bot.id}>`, "")
            .trim()
            .split();
        switch (action.toLowerCase()) {
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
    handleChatter = async (self, message) => {
        const { user } = await self.api.users.info({ user: message.user });
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
