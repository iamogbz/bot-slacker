import Bot from "../bot";
import app from "../../lib/apps";
import ci from "../../lib/custom_integrations";

describe("Bot Test", () => {
    const mockToken = "mock-token";
    const mockClientId = "mockClientId";
    const mockClientSecret = "mock-client-secret";
    const mockPort = 8765;
    const mockUser = { user: { tz_offset: -4 } };
    const mockController = {
        on: jest.fn(),
        hears: jest.fn(),
        reply: jest.fn(),
        api: {
            channels: {
                leave: jest.fn(),
                join: jest.fn(),
            },
            users: { info: jest.fn() },
            reactions: { add: jest.fn() },
        },
    };

    const resetTestEnv = () => {
        Bot.getProcessEnv = () => ({});
    };

    const setupCIEnv = () => {
        Bot.getProcessEnv = () => ({ TOKEN: mockToken });
    };
    const setupCIEnvSlack = () => {
        Bot.getProcessEnv = () => ({ SLACK_TOKEN: mockToken });
    };
    const setupAppEnv = () => {
        Bot.getProcessEnv = () => ({
            CLIENT_ID: mockClientId,
            CLIENT_SECRET: mockClientSecret,
            PORT: mockPort,
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
        it("initialises with correct app config", () => {
            setupAppEnv();
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

    describe("installation", () => {
        beforeEach(() => resetTestEnv());

        it("start private conversation as app", () => {
            setupAppEnv();
            const bot = new Bot();
            const mockBot = { startPrivateConversation: jest.fn() };
            const mockInstaller = {};
            bot.onInstallation(mockBot, mockInstaller);
            expect(mockBot.startPrivateConversation).toHaveBeenCalledWith(
                { user: mockInstaller },
                expect.any(Function),
            );
            const callback = mockBot.startPrivateConversation.mock.calls[0][1];
            const mockConvo = { say: jest.fn() };
            callback(null, mockConvo);
            expect(mockConvo.say).toHaveBeenCalled();
            mockConvo.say.mockReset();
            const mockError = new Error("mock error");
            console.warn = jest.fn();
            callback(mockError, mockConvo);
            expect(mockConvo.say).not.toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith(mockError);
        });

        it("does nothing in ci", () => {
            setupCIEnv();
            const bot = new Bot();
            const mockBot = { startPrivateConversation: jest.fn() };
            bot.onInstallation(mockBot);
            expect(mockBot.startPrivateConversation).not.toHaveBeenCalled();
        });
    });

    describe("new controller", () => {
        const bot = new Bot();

        beforeEach(() => resetTestEnv());

        function testTokenConfig() {
            ci.configure = jest.fn(() => mockController);
            const controller = bot.newController(Bot.getProcessEnv());
            expect(ci.configure).toBeCalledWith(
                mockToken,
                bot.config,
                expect.any(Function),
            );
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

        it("configures controller with secret", () => {
            setupAppEnv();
            app.configure = jest.fn(() => mockController);
            const controller = bot.newController(Bot.getProcessEnv());
            expect(app.configure).toBeCalledWith(
                mockPort,
                mockClientId,
                mockClientSecret,
                bot.config,
                expect.any(Function),
            );
            expect(controller).toBe(mockController);
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
                ["rtm_open", bot.onRtmOpen],
                ["rtm_close", bot.onRtmClose],
                ["bot_channel_join", bot.handleNewRoom],
                ["bot_group_join", bot.handleNewRoom],
                ["ambient", bot.handleChatter],
                ["direct_message", bot.handleDM],
            ]);
            expect(mockController.hears).toBeCalledWith(
                ["leave", "join"],
                ["direct_mention", "mention"],
                bot.handleDM,
            );
        });

        it("does not connects on rtm open", () => {
            const bot = new Bot();
            bot.connect = jest.fn();
            bot.onRtmOpen();
            expect(bot.isConnected).toBe(true);
            expect(bot.connect).not.toHaveBeenCalled();
        });

        it("reconnects on rtm close", () => {
            const bot = new Bot();
            bot.connect = jest.fn();
            bot.onRtmClose();
            expect(bot.connect).toHaveBeenCalled();
            expect(bot.isConnected).toBe(false);
        });
    });

    describe("join leave room", () => {
        const bot = new Bot();
        it("attempts to leave room", () => {
            const { leave } = Bot.config.vocab.control;
            const { leave: mockLeaveFn } = mockController.api.channels;
            const name = "mock-room";
            const message = { text: `${leave} ${name} now` };
            bot.joinLeaveRoom(mockController, leave, message);
            expect(mockLeaveFn).toBeCalledWith({ name }, expect.any(Function));
            // test error fn passed
            mockLeaveFn.mock.calls[0][1]();
            expect(mockController.reply).toHaveBeenCalledWith(
                message,
                Bot.config.spiel.no,
            );
        });

        it("attempts to join room", () => {
            const { join } = Bot.config.vocab.control;
            const { join: mockJoinFn } = mockController.api.channels;
            const name = "mock-room";
            const mockMessage = { text: `${join} ${name} now` };
            bot.joinLeaveRoom(mockController, join, mockMessage);
            expect(mockJoinFn).toBeCalledWith({ name }, expect.any(Function));
            // test error fn passed
            mockJoinFn.mock.calls[0][1]();
            expect(mockController.reply).toHaveBeenCalledWith(
                mockMessage,
                Bot.config.spiel.no,
            );
        });
    });

    describe("handle direct message", () => {
        const bot = new Bot();
        beforeAll(() => {
            bot.joinLeaveRoom = jest.fn();
        });

        function testControlCommand(command) {
            const mockAction = command.toUpperCase();
            const mockMessage = { match: [mockAction] };
            bot.handleDM(mockController, mockMessage);
            expect(bot.joinLeaveRoom).toBeCalledWith(
                mockController,
                mockAction,
                mockMessage,
            );
        }

        it("responds to join command ", () => {
            testControlCommand(Bot.config.vocab.control.join);
        });

        it("responds to leave command", () => {
            testControlCommand(Bot.config.vocab.control.leave);
        });

        it("sends default response", () => {
            const mockMessage = { match: ["unhandled action"] };
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
        };

        it("posts message on room entry", () => {
            bot.handleNewRoom(mockController, mockMessage);
            expect(mockController.reply).toBeCalledWith(
                mockMessage,
                Bot.config.spiel.entry,
            );
        });

        it("post go home message or reaction on late chatter", () => {
            bot.isLate = jest.fn(() => true);
            bot.isTired = jest.fn(() => false);

            bot.handleChatter(mockController, mockMessage);
            const mockInfoFn = mockController.api.users.info;
            expect(mockInfoFn).toBeCalledWith(
                { user: mockMessage.user },
                expect.any(Function),
            );

            bot.shouldUseReaction = jest.fn(() => true);
            mockInfoFn.mock.calls[0][1]({}, { user: mockUser });
            expect(mockController.api.reactions.add).toBeCalledWith({
                timestamp: mockMessage.ts,
                channel: mockMessage.channel,
                name: Bot.config.reaction.default,
            });

            bot.shouldUseReaction = jest.fn(() => false);
            mockInfoFn.mock.calls[0][1]({}, { user: mockUser });
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
