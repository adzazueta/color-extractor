import { describe, expect, test, vi } from "vite-plus/test";
import { ColorExtractorError } from "@/core/errors.js";
import { abortedError, normalizeError, raceAbort, throwIfAborted } from "@/shared/abort.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("abortedError and throwIfAborted", () => {
  test("build ABORTED with the reason as cause", () => {
    const controller = new AbortController();
    controller.abort("stop");
    const error = abortedError(controller.signal);
    expect(error).toBeInstanceOf(ColorExtractorError);
    expect(error.code).toBe("ABORTED");
    expect(error.message).toBe("The operation was aborted.");
    expect(error.cause).toBe("stop");
  });

  test("throwIfAborted ignores a missing or live signal", () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
    expect(() => throwIfAborted(new AbortController().signal)).not.toThrow();
  });

  test("throwIfAborted throws ABORTED for an aborted signal", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrowError(
      expect.objectContaining({ code: "ABORTED" }),
    );
  });
});

describe("raceAbort", () => {
  test("returns the same promise without a signal", async () => {
    const promise = Promise.resolve(1);
    expect(raceAbort(promise, undefined)).toBe(promise);
  });

  test("rejects at once when the signal is already aborted, and discards the late value", async () => {
    const controller = new AbortController();
    controller.abort();
    const { promise, resolve } = deferred<number>();
    const discard = vi.fn();
    await expect(raceAbort(promise, controller.signal, discard)).rejects.toMatchObject({
      code: "ABORTED",
    });
    resolve(7);
    await tick();
    expect(discard).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("rejects when the signal aborts while pending", async () => {
    const controller = new AbortController();
    const { promise } = deferred<number>();
    const raced = raceAbort(promise, controller.signal);
    controller.abort(new Error("why"));
    await expect(raced).rejects.toMatchObject({ code: "ABORTED", cause: expect.any(Error) });
  });

  test("resolves with a value that arrives before the abort", async () => {
    const controller = new AbortController();
    const discard = vi.fn();
    const { promise, resolve } = deferred<number>();
    const raced = raceAbort(promise, controller.signal, discard);
    resolve(3);
    await expect(raced).resolves.toBe(3);
    controller.abort();
    await tick();
    expect(discard).not.toHaveBeenCalled();
  });

  test("passes the original rejection through when it comes first", async () => {
    const controller = new AbortController();
    const failure = new Error("boom");
    await expect(raceAbort(Promise.reject(failure), controller.signal)).rejects.toBe(failure);
  });

  test("sends a late value to discard", async () => {
    const controller = new AbortController();
    const discard = vi.fn();
    const { promise, resolve } = deferred<string>();
    const raced = raceAbort(promise, controller.signal, discard);
    controller.abort();
    await expect(raced).rejects.toMatchObject({ code: "ABORTED" });
    resolve("late");
    await tick();
    expect(discard).toHaveBeenCalledExactlyOnceWith("late");
  });

  test("swallows a late rejection and a throwing discard", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const first = new AbortController();
      const a = deferred<number>();
      const racedA = raceAbort(a.promise, first.signal);
      first.abort();
      await expect(racedA).rejects.toMatchObject({ code: "ABORTED" });
      a.reject(new Error("late failure"));

      const second = new AbortController();
      const b = deferred<number>();
      const racedB = raceAbort(b.promise, second.signal, () => {
        throw new Error("discard failed");
      });
      second.abort();
      await expect(racedB).rejects.toMatchObject({ code: "ABORTED" });
      b.resolve(1);

      const third = new AbortController();
      third.abort();
      await expect(raceAbort(Promise.reject(new Error("x")), third.signal)).rejects.toMatchObject({
        code: "ABORTED",
      });
      await tick();
      await tick();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  test("removes the listener when the promise settles", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await raceAbort(Promise.resolve(1), controller.signal);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledExactlyOnceWith("abort", add.mock.calls[0]?.[1]);
    await raceAbort(Promise.reject(new Error("x")), controller.signal).catch(() => {});
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

describe("normalizeError", () => {
  test("returns a ColorExtractorError unchanged", () => {
    const error = new ColorExtractorError("FETCH_FAILED", "x");
    const controller = new AbortController();
    controller.abort();
    expect(normalizeError(error, controller.signal)).toBe(error);
  });

  test("returns ABORTED, with the reason, once the signal has aborted", () => {
    const controller = new AbortController();
    controller.abort("because");
    const error = normalizeError("some string error", controller.signal);
    expect(error.code).toBe("ABORTED");
    expect(error.cause).toBe("because");
  });

  test("wraps anything else as PROCESSING_FAILED with the cause", () => {
    const cause = new TypeError("bad");
    const error = normalizeError(cause, new AbortController().signal);
    expect(error.code).toBe("PROCESSING_FAILED");
    expect(error.message).toBe("Color extraction failed unexpectedly.");
    expect(error.cause).toBe(cause);
    expect(normalizeError("text", undefined).cause).toBe("text");
  });
});
