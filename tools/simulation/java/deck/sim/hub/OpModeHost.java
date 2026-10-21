package deck.sim.hub;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Lockstep between a team OpMode thread and the simulation. The OpMode runs freely until it
 * reaches a sync point (opModeIsActive(), idle(), sleep() or waitForStart()); there it hands
 * control back and waits for the next physics tick. One pass of a while (opModeIsActive()) loop
 * is therefore exactly one simulation step, whatever the host computer's speed.
 */
public final class OpModeHost {
    private static final Semaphore toOpMode = new Semaphore(0), toHub = new Semaphore(0);
    private static volatile boolean started, stopRequested, finished;
    private static volatile Throwable failure;
    private static Thread thread;

    private OpModeHost() {}

    /** Called by the OpMode thread: give the tick back and wait for the next one. */
    public static void sync() {
        if (stopRequested || Thread.currentThread() != thread) return;
        toHub.release();
        try {
            toOpMode.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            stopRequested = true;
        }
    }

    public static void waitForStart() {
        while (!started && !stopRequested) sync();
    }

    public static void sleep(long milliseconds) {
        long until = deck.sim.SimClock.nanoTime() + milliseconds * 1_000_000L;
        do sync(); while (!stopRequested && deck.sim.SimClock.nanoTime() < until);
    }

    public static boolean started() { return started; }
    public static boolean stopRequested() { return stopRequested; }
    public static boolean finished() { return finished; }
    public static Throwable failure() { return failure; }
    public static void requestStop() { stopRequested = true; }

    /** Starts the OpMode body; returns once it reaches its first sync point (end of init). */
    static boolean launch(Runnable body, long timeoutMillis) throws InterruptedException {
        started = false; stopRequested = false; finished = false; failure = null;
        toOpMode.drainPermits(); toHub.drainPermits();
        thread = new Thread(() -> {
            try {
                body.run();
            } catch (Throwable e) {
                failure = e;
            } finally {
                finished = true;
                toHub.release();
            }
        }, "OpMode");
        thread.setDaemon(true);
        thread.start();
        return toHub.tryAcquire(timeoutMillis, TimeUnit.MILLISECONDS);
    }

    /** One simulation tick of OpMode time; false if it did not hand control back in time. */
    static boolean step(long timeoutMillis) throws InterruptedException {
        if (finished) return true;
        started = true;
        toOpMode.release();
        return toHub.tryAcquire(timeoutMillis, TimeUnit.MILLISECONDS);
    }

    static void stop() {
        stopRequested = true;
        toOpMode.release(1000);
        if (thread != null) thread.interrupt();
    }
}
