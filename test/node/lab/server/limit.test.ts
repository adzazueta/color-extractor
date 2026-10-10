import { expect, test } from "vite-plus/test";
import { HttpError } from "../../../../lab/server/http.js";
import { createLimiter } from "../../../../lab/server/limit.js";

interface Gate {
  readonly promise: Promise<void>;
  open(): void;
}

function gate(): Gate {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("at most 2 jobs run at once, in arrival order", async () => {
  const limiter = createLimiter(2, 16);
  const gates = Array.from({ length: 5 }, gate);
  const started: number[] = [];
  let running = 0;
  let maxRunning = 0;
  const results = gates.map((g, index) =>
    limiter.run(async () => {
      started.push(index);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await g.promise;
      running -= 1;
      return index;
    }),
  );
  await tick();
  expect(started).toEqual([0, 1]);
  expect([limiter.active, limiter.queued]).toEqual([2, 3]);
  gates[1]?.open();
  await tick();
  expect(started).toEqual([0, 1, 2]);
  for (const g of gates) g.open();
  expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
  expect(maxRunning).toBe(2);
  expect([limiter.active, limiter.queued]).toEqual([0, 0]);
});

test("a full queue gives a 503", async () => {
  const limiter = createLimiter(2, 16);
  const g = gate();
  const accepted = Array.from({ length: 18 }, () => limiter.run(() => g.promise));
  await tick();
  expect([limiter.active, limiter.queued]).toEqual([2, 16]);
  const refused = limiter.run(() => "late");
  await expect(refused).rejects.toBeInstanceOf(HttpError);
  await expect(refused).rejects.toMatchObject({
    status: 503,
    message: expect.stringContaining("busy"),
  });
  g.open();
  await Promise.all(accepted);
  await expect(limiter.run(() => "after")).resolves.toBe("after");
});

test("a failing job frees its slot and keeps its error", async () => {
  const limiter = createLimiter(1, 1);
  const failed = limiter.run(() => {
    throw new Error("boom");
  });
  const next = limiter.run(() => Promise.reject(new Error("async boom")));
  await expect(failed).rejects.toThrow("boom");
  await expect(next).rejects.toThrow("async boom");
  await expect(limiter.run(() => 1)).resolves.toBe(1);
});

test("close() refuses the queued jobs and later ones; running ones finish", async () => {
  const limiter = createLimiter(1, 4);
  const g = gate();
  const running = limiter.run(async () => {
    await g.promise;
    return "done";
  });
  const queued = limiter.run(() => "queued");
  await tick();
  limiter.close();
  await expect(queued).rejects.toMatchObject({ status: 503 });
  await expect(limiter.run(() => "later")).rejects.toMatchObject({ status: 503 });
  g.open();
  await expect(running).resolves.toBe("done");
});
