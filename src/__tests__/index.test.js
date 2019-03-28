import Bot from "../bot";

const mockConnectFn = jest.fn();
jest.mock("../bot", () =>
    jest.fn().mockImplementation(() => ({ connect: mockConnectFn })),
);
require("..");

describe("Entry", () => {
    it("creates and connects new bot", () => {
        expect(Bot).toHaveBeenCalled();
        expect(mockConnectFn).toHaveBeenCalled();
    });
});
