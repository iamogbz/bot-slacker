import * as botkit from "botkit";

const mockToken = "mock-token";
const mockSecret = "mock-secret";
const mockUser = { user: { tz_offset: -4 } };
const mockController = {
    api: {
        channels: {
            leave: jest.fn(),
            join: jest.fn(),
        },
        users: { info: jest.fn() },
        reactions: { add: jest.fn() },
    },
    hears: jest.fn(),
    on: jest.fn(),
    ready: jest.fn(cb => cb()),
    reply: jest.fn(),
    spawn: jest.fn(),
};
botkit.Botkit = jest.fn(() => mockController);

const Bot = require("../bot").default;

describe("Bot Test", () => {
    const resetTestEnv = () => {
        Bot.getProcessEnv = () => ({
            TOKEN: mockToken,
        });
    };
    const setupCIEnv = () => {
        Bot.getProcessEnv = () => ({
            TOKEN: mockToken,
            SLACK_SECRET: mockSecret,
        });
    };
    const setupCIEnvSlack = () => {
        Bot.getProcessEnv = () => ({
            SLACK_TOKEN: mockToken,
            SLACK_SECRET: mockSecret,
        });
    };

    beforeEach(() => {
        mockController.on.mockReset();
        mockController.hears.mockReset();
        mockController.reply.mockReset();
        mockController.api.channels.leave.mockReset();
        mockController.api.channels.join.mockReset();
        mockController.api.users.info.mockReset();
        mockController.api.reactions.add.mockReset();
    });

    describe("instantiation", () => {
        beforeEach(() => resetTestEnv());

        it("initialises with correct ci config", () => {
            setupCIEnv();
            expect(new Bot().config).toMatchSnapshot();
        });
    });

    describe("configure store", () => {
        beforeEach(() => resetTestEnv());

        it("uses json file store", () => {
            expect(new Bot().config.storage).toBeUndefined();
            expect(new Bot().config.json_file_store).toBeDefined();
            setupCIEnv();
            expect(new Bot().config.json_file_store).toBeDefined();
        });
    });

    describe("new controller", () => {
        const bot = new Bot();

        beforeEach(() => resetTestEnv());

        function testTokenConfig() {
            const controller = bot.newController(Bot.getProcessEnv());
            expect(controller).toBe(mockController);
        }

        it("configures ci with token", () => {
            setupCIEnv();
            testTokenConfig();
        });

        it("configures ci with slacktoken", () => {
            setupCIEnvSlack();
            testTokenConfig();
        });

        it("logs error when configuring controller with no keys", () => {
            console.error = jest.fn();
            process.exit = jest.fn();
            bot.newController();
            expect(console.error).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });
    });

    describe("connect controller", () => {
        it("registers listeners on new controller", () => {
            // mock register listener and new controller
            const bot = new Bot();
            bot.newController = jest.fn(() => mockController);
            const registerListeners = jest.spyOn(bot, "registerListeners");
            bot.connect();
            expect(registerListeners).toHaveBeenCalledWith(mockController);
        });

        it("registers all required listeners on controller", () => {
            // mock all the things check for auto spec
            const bot = new Bot();
            bot.registerListeners(mockController);
            expect(mockController.on.mock.calls).toEqual([
                ["bot_channel_join", bot.handleNewRoom],
                ["bot_group_join", bot.handleNewRoom],
                ["message", bot.handleChatter],
                ["direct_message", bot.handleDM],
                ["app_mention", bot.handleDM],
            ]);
        });
    });

    describe("handle direct message", () => {
        const bot = new Bot();
        const mockMessage = {
            user: mockUser,
            ts: 12345678,
            channel: "mock-channel",
            incoming_message: {
                recipient: { id: "mockid" },
                channelData: { text: "mock text" },
            },
        };

        it("sends default response", () => {
            bot.handleDM(mockController, mockMessage);
            expect(mockController.reply).toBeCalledWith(
                mockMessage,
                Bot.config.spiel.confused,
            );
        });
    });

    describe("handle room", () => {
        const bot = new Bot();
        const mockMessage = {
            user: mockUser,
            ts: 12345678,
            channel: "mock-channel",
            incoming_message: {
                recipient: { id: "mockid" },
                channelData: { text: "mock text" },
            },
        };

        it("posts message on room entry", () => {
            bot.handleNewRoom(mockController, mockMessage);
            expect(mockController.reply).toBeCalledWith(
                mockMessage,
                Bot.config.spiel.entry,
            );
        });

        it("post go home message or reaction on late chatter", async () => {
            bot.isLate = jest.fn(() => true);
            bot.isTired = jest.fn(() => false);

            const mockInfoFn = mockController.api.users.info;
            mockInfoFn.mockResolvedValue({ user: mockUser });
            bot.shouldUseReaction = jest.fn(() => true);

            await bot.handleChatter(mockController, mockMessage);
            expect(mockInfoFn).toBeCalledWith({ user: mockMessage.user });
            expect(mockController.api.reactions.add).toBeCalledWith({
                timestamp: mockMessage.ts,
                channel: mockMessage.channel,
                name: Bot.config.reaction.default,
            });

            bot.shouldUseReaction = jest.fn(() => false);
            await bot.handleChatter(mockController, mockMessage);
            expect(mockController.reply).toBeCalledWith(
                mockMessage,
                expect.any(String),
            );
        });
    });

    describe("islate", () => {
        const bot = new Bot();
        it("correctly calculates timezone", () => {
            const mockTs = 1530071118;
            expect(bot.isLate(mockTs, 14400)).toBe(false);
            expect(bot.isLate(mockTs, 3600)).toBe(true);
        });

        it("uses default timezone", () => {
            const mockTs = 1530050018;
            expect(bot.isLate(mockTs)).toBe(false);
            expect(bot.isLate(mockTs, 0)).toBe(true);
        });
    });

    describe("responses", () => {
        it("generates valid go home message", () => {
            const bot = new Bot();
            expect(bot.generateGoHome().trim().length).toBeGreaterThan(0);
        });
    });

    describe("shouldUseReaction", () => {
        it("returns boolean value", () => {
            expect(typeof new Bot().shouldUseReaction()).toBe("boolean");
        });
    });

    describe("isLate", () => {
        it("returns boolean value", () => {
            expect(typeof new Bot().isTired()).toBe("boolean");
        });
    });
});
