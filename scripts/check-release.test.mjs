import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRelease } from "./check-release.mjs";
test("accepts an aligned stable version", () =>
  assert.equal(
    validateRelease("v0.1.0", ["0.1.0", "0.1.0", "0.1.0"]),
    "0.1.0",
  ));
test("rejects a misleading tag", () =>
  assert.throws(() => validateRelease("v2.0.0", ["0.1.0", "0.1.0", "0.1.0"])));
test("rejects inconsistent package metadata", () =>
  assert.throws(() => validateRelease("v0.1.0", ["0.1.0", "0.2.0", "0.1.0"])));
test("accepts aligned prerelease metadata", () =>
  assert.equal(
    validateRelease("v0.1.0-beta.1", [
      "0.1.0-beta.1",
      "0.1.0-beta.1",
      "0.1.0-beta.1",
    ]),
    "0.1.0-beta.1",
  ));
