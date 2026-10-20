package deck.sim;

/**
 * Simulation time for Pedro Pathing. The simulator build redirects Pedro core's
 * System.nanoTime() reads (PID integral/derivative timing, Foresight's hold timeout,
 * Follower.update()) here, so pausing or stepping faster than real time cannot wind up an
 * integral or expire a timeout in wall-clock time. Only the bridge advances it, once per tick.
 */
public final class SimClock {
    private static volatile long nanos = 1_000_000_000L;

    private SimClock() {}

    public static long nanoTime() {
        return nanos;
    }

    static void setSeconds(double seconds) {
        long next = 1_000_000_000L + Math.round(seconds * 1e9);
        if (next < nanos) throw new IllegalStateException("Simulation time cannot run backwards.");
        nanos = next;
    }
}
