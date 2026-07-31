import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { buildBillplzSignatureString } from "./payments/billplz";

describe("buildBillplzSignatureString", () => {
  it("sorts keys alphabetically and joins key|value pairs with '|'", () => {
    const params = { paid: "true", amount: "901", reference_1: "ord_1" };
    expect(buildBillplzSignatureString(params)).toBe("amount|901|paid|true|reference_1|ord_1");
  });

  it("excludes the x_signature field from the signing string", () => {
    const params = { amount: "100", x_signature: "deadbeef", paid: "true" };
    expect(buildBillplzSignatureString(params)).toBe("amount|100|paid|true");
  });

  it("produces a string whose HMAC-SHA256 matches an independently computed vector", () => {
    const secret = "test_x_signature_key";
    const params = { amount: "901", paid: "true", reference_1: "ord_42" };

    const signingString = buildBillplzSignatureString(params);
    const handComputed = "amount|901|paid|true|reference_1|ord_42";
    expect(signingString).toBe(handComputed);

    const expected = crypto.createHmac("sha256", secret).update(handComputed).digest("hex");
    const actual = crypto.createHmac("sha256", secret).update(signingString).digest("hex");
    expect(actual).toBe(expected);
  });
});
