describe("Test Bot", function () {
    it("has environment variables", function () {
        // check if all process.env are set up
    });

    it("initialises with correct config", function () {
        // check bot config after init
    });

    it("configures mongo store", function () {
        // check bot config store mongo
    });

    it("configures json file store", function () {
        // check bot config json file store
    });

    test("on installation as app", function () {
        // this should call bot.startPrivateConversation
    });

    test("on installation as ci", function () {
        // this should do nothing and return
    });

    test("new controller with token", function () {
        // this configures a ci (mock)
    });

    test("new controller with secret", function () {
        // this configures an app (mock)
    });

    test("new controller with no keys", function () {
        // logs error and exit process with 1
    });

    test("connect registers listeners on new controller", function () {
        // mock register listener and new controller
    });

    it("registers all required listeners on controller", function () {
        // mock all the things check for auto spec
    });

    it("attempts to leave room", function () {
        // check correct vocab and functionality
    });

    it("attempts to join room", function () {
        // check correct vocab and functionality
    });

    it("calls error function when join/leave fails", function () {
        // mock error
    });

    it("responds to vocab in direct message", function () {

    });

    test("default response in direct message", function () {

    });

    test("default response in direct message", function () {

    });

    test("default response in direct message", function () {

    });

    it("posts message on room entry", function () {

    });

    it("post go home message or reaction on late chatter", function () {
        // mock is late
    });

    test("islate correctly calculates timezone", function () {});

    test("islate uses default timezone", function () {});

    it("generates valid go home message", function () {});
});
